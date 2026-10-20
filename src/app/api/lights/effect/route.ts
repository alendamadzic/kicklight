import type { NextRequest } from "next/server";
import { EFFECTS, type EffectKey } from "@/engine/effects";
import type { Side } from "@/engine/model";
import type { MirroredCommand } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { playFrames } from "@/lights/play";
import { HueRemoteError } from "@/lights/remote";
import { restingFromRecent } from "@/lights/render";
import { apiError, json, requireUser } from "@/server/auth";
import { transportFor } from "@/server/hue-link";
import { activeStreamFor } from "@/server/local-streaming";
import { isRgb } from "@/server/validate";

// A replay waits for the whole animation (up to ~7 s) before answering.
export const maxDuration = 30;

/**
 * Fire one effect from the demo's event pad or a ticker replay. While a match is streaming
 * it goes into that stream (the bridge ignores REST then), so it plays exactly as it did live.
 * Otherwise the effect's own frames are played as REST gradient keyframes, the same
 * animation the virtual strip shows.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const b = (await request.json().catch(() => null)) as {
    effect?: string;
    side?: unknown;
    home?: unknown;
    away?: unknown;
  } | null;
  const fx = b?.effect ? EFFECTS[b.effect as EffectKey] : undefined;
  if (!fx || !isRgb(b?.home) || !isRgb(b?.away))
    return apiError("bad_effect", 400);
  const side: Side | null =
    b?.side === "home" || b?.side === "away" ? b.side : null;

  const stream = activeStreamFor(user.id);
  if (
    stream &&
    (await stream
      .applyCommand(
        { kind: "effect", effect: fx.key, side },
        { home: b.home, away: b.away },
      )
      .catch(() => false))
  )
    return json({ ok: true, skipped: false });

  const admin = createAdminClient();
  const t = await transportFor(admin, user.id);
  if (!t?.link.light_id) return apiError("not_linked", 409);
  const ctx = { home: b.home, away: b.away, side, winner: null };
  try {
    const { data } = await admin
      .from("sessions")
      .select("runner_state")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recent = (data?.runner_state?.recent ?? []) as MirroredCommand[];
    await playFrames(
      t.transport,
      fx,
      ctx,
      restingFromRecent(recent, t.transport.points, ctx),
    );
    return json({ ok: true, skipped: false });
  } catch (e) {
    if (e instanceof HueRemoteError && e.unauthorized)
      return apiError("hue_unauthorized", 401);
    return apiError("hue_unavailable", 502, (e as Error).message);
  }
}
