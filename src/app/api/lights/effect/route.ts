import type { NextRequest } from "next/server";
import { EFFECTS } from "@/engine/effects";
import type { MirroredCommand } from "@/lib/api-types";
import { playFrames } from "@/lights/play";
import { restingFromRecent } from "@/lights/render";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { activeStreamFor } from "@/server/local-streaming";
import { parseFireEffect } from "@/server/validate";
import { withUserTransport } from "@/server/with-transport";

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
  const body = parseFireEffect(await readJson(request));
  const fx = body && EFFECTS[body.effect];
  if (!body || !fx)
    return apiError("bad_request", 400, "Unknown effect or colours");
  const { effect, side, home, away } = body;

  const stream = activeStreamFor(user.id);
  const streamed = await stream
    ?.applyCommand({ kind: "effect", effect, side }, { home, away })
    .catch(() => false);
  if (streamed) return json({ ok: true });

  return withUserTransport(user.id, async ({ transport }, admin) => {
    // Settle back onto whatever the live session last showed, if one is running.
    const { data } = await admin
      .from("sessions")
      .select("runner_state")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const recent = (data?.runner_state?.recent ?? []) as MirroredCommand[];
    const ctx = { home, away, side, winner: null };
    await playFrames(
      transport,
      fx,
      ctx,
      restingFromRecent(recent, transport.points, ctx),
    );
    return json({ ok: true });
  });
}
