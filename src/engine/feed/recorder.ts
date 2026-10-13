import type { EventType } from "../model";
import { parseEspnSummary } from "./espn";
import type { ReplayScript } from "./replay";

// Turns raw ESPN payloads captured during a live match into a ReplayScript, so a great
// real game can be replayed in the demo and used as a test fixture.

export interface Recording {
  /** ms since epoch the payload was fetched. */
  capturedAt: number;
  payload: unknown;
}

const KEEP: ReadonlySet<EventType> = new Set([
  "kickoff",
  "goal",
  "own_goal",
  "penalty_awarded",
  "penalty_missed",
  "yellow_card",
  "red_card",
  "var",
  "var_overturned",
  "corner",
  "shot_on_target",
  "shot",
  "foul",
  "substitution",
  "half_time",
  "second_half",
  "full_time",
]);

export function scriptFromRecordings(
  recordings: Recording[],
  meta: { id: string; title: string; blurb: string; league: string },
): ReplayScript {
  if (recordings.length === 0) throw new Error("no recordings");
  const sorted = [...recordings].sort((a, b) => a.capturedAt - b.capturedAt);
  const parsed = sorted.map((r) => parseEspnSummary(r.payload, meta.league));
  const last = parsed[parsed.length - 1];

  // Possession is a moving number: take it from every snapshot, keyed by match minute.
  const curve = new Map<number, number>();
  for (const p of parsed) {
    const m = p.snapshot.minute;
    const poss = p.snapshot.stats.home.possession;
    if (m != null && poss != null) curve.set(Math.round(m), Math.round(poss));
  }
  const possession = [...curve.entries()].sort((a, b) => a[0] - b[0]) as [
    number,
    number,
  ][];

  const events = last.events
    .filter((e) => KEEP.has(e.type))
    .map((e) => ({ minute: e.minute, type: e.type, side: e.side }))
    .sort((a, b) => a.minute - b.minute);
  const endMinute = Math.max(
    90,
    last.snapshot.minute ?? 0,
    ...events.map((e) => e.minute),
  );

  return {
    id: meta.id,
    title: meta.title,
    blurb: meta.blurb,
    league: meta.league,
    home: last.snapshot.home,
    away: last.snapshot.away,
    endMinute,
    possession: possession.length ? possession : [[0, 50]],
    events,
  };
}
