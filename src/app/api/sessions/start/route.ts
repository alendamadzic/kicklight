import type { NextRequest } from "next/server";
import type { StartSessionResponse } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { getLink } from "@/server/hue-link";
import { endLiveSessions } from "@/server/live-sessions";
import { parseStartSession } from "@/server/validate";

/** Start following a match (or a scripted replay) on the user's strip. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = parseStartSession(await readJson(request));
  if (!body) return apiError("bad_request", 400, "Unknown match");

  const admin = createAdminClient();
  try {
    const link = await getLink(admin, user.id);
    if (!link) return apiError("not_linked", 409, "Link Hue first");
    if (!link.light_id)
      return apiError("no_light", 409, "Choose a strip first");

    const { data: prefs } = await admin
      .from("preferences")
      .select("tv_delay_ms, default_stat")
      .eq("user_id", user.id)
      .maybeSingle();

    // One live session per user: end the old one (and give the strip back) first.
    await endLiveSessions(admin, user.id);

    // Inserted as the user, so RLS checks it's theirs.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        league: body.league,
        event_id: body.eventId,
        stat:
          body.stat ?? (prefs?.default_stat as string | undefined) ?? "auto",
        mode: link.transport,
        delay_ms:
          body.delayMs ?? (prefs?.tv_delay_ms as number | undefined) ?? 0,
      })
      .select("id")
      .single();
    if (error || !data) return apiError("db_error", 500, error?.message);
    return json({
      sessionId: data.id as string,
    } satisfies StartSessionResponse);
  } catch (e) {
    return apiError("db_error", 500, (e as Error).message);
  }
}
