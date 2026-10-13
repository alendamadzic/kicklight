import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchEspnRaw,
  type ParsedMatch,
  parseEspnSummary,
} from "@/engine/feed/espn";

// Opt-in capture of raw feed payloads (KICKLIGHT_RECORD=1) so great matches can be
// exported as replays. Throttled per match; failures never affect the lights.

const EVERY_MS = 60_000;
const lastSaved = new Map<string, number>();

export function liveFeed(admin: SupabaseClient) {
  const record = process.env.KICKLIGHT_RECORD === "1";
  return async (league: string, eventId: string): Promise<ParsedMatch> => {
    const raw = await fetchEspnRaw(league, eventId);
    if (record) {
      const key = `${league}/${eventId}`;
      const now = Date.now();
      if (now - (lastSaved.get(key) ?? 0) >= EVERY_MS) {
        lastSaved.set(key, now);
        void admin
          .from("recordings")
          .insert({ league, event_id: eventId, payload: trimEspnPayload(raw) })
          .then(({ error }) => {
            if (error)
              console.error("[kicklight] recording failed:", error.message);
          });
      }
    }
    return parseEspnSummary(raw, league);
  };
}
