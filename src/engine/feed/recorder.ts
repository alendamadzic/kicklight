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
  "free_kick",
  "offside",
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

// biome-ignore lint/suspicious/noExplicitAny: ESPN's response is undocumented; reads are defensive
type Json = any;

/**
 * ESPN's full summary is ~400 KB (news, odds, rosters, videos). Keep only what the parser
 * reads so a recorded match is tens of KB, not tens of MB.
 */
export function trimEspnPayload(raw: Json): Json {
  const teams = (raw?.boxscore?.teams ?? []).map((t: Json) => ({
    homeAway: t.homeAway,
    statistics: t.statistics,
    team: {
      id: t.team?.id,
      displayName: t.team?.displayName,
      shortDisplayName: t.team?.shortDisplayName,
      abbreviation: t.team?.abbreviation,
      color: t.team?.color,
      alternateColor: t.team?.alternateColor,
      logo: t.team?.logo,
    },
  }));
  return {
    header: raw?.header
      ? {
          id: raw.header.id,
          league: raw.header.league
            ? { slug: raw.header.league.slug }
            : undefined,
          competitions: (raw.header.competitions ?? []).map((c: Json) => ({
            id: c.id,
            date: c.date,
            status: c.status,
            competitors: (c.competitors ?? []).map((k: Json) => ({
              homeAway: k.homeAway,
              score: k.score,
              team: k.team,
            })),
          })),
        }
      : undefined,
    boxscore: { teams },
    keyEvents: raw?.keyEvents,
    commentary: (raw?.commentary ?? []).map((c: Json) => ({
      sequence: c.sequence,
      text: c.text,
      time: c.time,
      play: c.play
        ? {
            id: c.play.id,
            type: c.play.type,
            text: c.play.text,
            clock: c.play.clock,
            team: c.play.team ? { id: c.play.team.id } : undefined,
            scoringPlay: c.play.scoringPlay,
            wallclock: c.play.wallclock,
          }
        : undefined,
    })),
  };
}
