import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { transportFor } from "./hue-link";
import { streamTransportFor } from "./local-streaming";

/**
 * End the user's live (active or paused) sessions and give the strip back the way it was
 * before kick-off. A running Entertainment stream is stopped first: the bridge ignores
 * REST writes while it streams. Returns how many sessions were ended.
 */
export async function endLiveSessions(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: live, error } = await admin
    .from("sessions")
    .select("id, light_snapshot")
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);
  if (error) throw new Error(`read sessions: ${error.message}`);
  if (!live?.length) return 0;

  // Best effort: a strip that can't be reached shouldn't stop the session from ending.
  const transport =
    streamTransportFor(userId) ??
    (await transportFor(admin, userId).catch(() => null))?.transport;
  for (const s of live) {
    if (transport && s.light_snapshot)
      await transport.restore(s.light_snapshot).catch(() => {});
  }

  const { error: endError } = await admin
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .in(
      "id",
      live.map((s) => s.id),
    );
  if (endError) throw new Error(`end sessions: ${endError.message}`);
  return live.length;
}
