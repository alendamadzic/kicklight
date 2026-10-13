import type { NextRequest } from "next/server";
import { LEAGUES } from "@/engine/feed/leagues";
import { SCENARIOS } from "@/engine/feed/scenarios";
import { STAT_ORDER } from "@/engine/stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, json, requireUser } from "@/server/auth";
import { getLink, transportFor } from "@/server/hue-link";

const STATS = new Set<string>([...STAT_ORDER, "auto", "clock"]);

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const b = (await request.json().catch(() => null)) as {
    league?: unknown;
    eventId?: unknown;
    stat?: unknown;
    delayMs?: unknown;
  } | null;
  const league = typeof b?.league === "string" ? b.league : "";
  const eventId = typeof b?.eventId === "string" ? b.eventId : "";
  const okLeague =
    league === "replay"
      ? SCENARIOS.some((s) => s.id === eventId)
      : LEAGUES.some((l) => l.slug === league);
  if (!okLeague || !/^[\w.-]{1,40}$/.test(eventId))
    return apiError("bad_match", 400);

  const admin = createAdminClient();
  const link = await getLink(admin, user.id);
  if (!link?.light_id)
    return apiError("not_ready", 409, "Link Hue and choose a strip first");

  const { data: prefs } = await admin
    .from("preferences")
    .select("tv_delay_ms, default_stat")
    .eq("user_id", user.id)
    .maybeSingle();
  const stat =
    typeof b?.stat === "string" && STATS.has(b.stat)
      ? b.stat
      : ((prefs?.default_stat as string) ?? "auto");
  const delay =
    typeof b?.delayMs === "number" && b.delayMs >= 0 && b.delayMs <= 120_000
      ? Math.round(b.delayMs)
      : ((prefs?.tv_delay_ms as number) ?? 0);

  // One live session per user: end the old one (and give the strip back) first.
  const { data: live } = await admin
    .from("sessions")
    .select("id, light_snapshot")
    .eq("user_id", user.id)
    .in("status", ["active", "paused"]);
  if (live?.length) {
    const t = await transportFor(admin, user.id).catch(() => null);
    for (const s of live) {
      if (t && s.light_snapshot)
        await t.transport.restore(s.light_snapshot).catch(() => {});
    }
    await admin
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .in(
        "id",
        live.map((s) => s.id),
      );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      league,
      event_id: eventId,
      stat,
      mode: link.transport,
      delay_ms: delay,
    })
    .select("id")
    .single();
  if (error || !data) return apiError("db_error", 500, error?.message);
  return json({ sessionId: data.id as string });
}
