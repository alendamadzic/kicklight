// Turn captured matches into a replay script:
//   bun --conditions react-server scripts/export-recording.ts <league> <eventId> <id> "<title>"
// Reads the `recordings` table (KICKLIGHT_RECORD=1 fills it during live matches) and writes
// src/engine/feed/recorded/<id>.json. Add the file to SCENARIOS to use it in the demo.

import { mkdirSync, writeFileSync } from "node:fs";
import { scriptFromRecordings } from "../src/engine/feed/recorder";
import { createAdminClient } from "../src/lib/supabase/admin";

const [league, eventId, id, title] = process.argv.slice(2);
if (!league || !eventId || !id) {
  console.error('usage: export-recording.ts <league> <eventId> <id> "<title>"');
  process.exit(1);
}
const { data, error } = await createAdminClient()
  .from("recordings")
  .select("captured_at, payload")
  .eq("league", league)
  .eq("event_id", eventId)
  .order("captured_at");
if (error) throw error;
if (!data?.length) throw new Error(`no recordings for ${league}/${eventId}`);

const script = scriptFromRecordings(
  data.map((r) => ({
    capturedAt: Date.parse(r.captured_at as string),
    payload: r.payload,
  })),
  {
    id,
    title: title ?? id,
    blurb: `Recorded from a live match (${data.length} snapshots).`,
    league,
  },
);
mkdirSync("src/engine/feed/recorded", { recursive: true });
const out = `src/engine/feed/recorded/${id}.json`;
writeFileSync(out, `${JSON.stringify(script, null, 2)}\n`);
console.log(
  `wrote ${out}: ${script.events.length} events, ends ${script.endMinute}'`,
);
