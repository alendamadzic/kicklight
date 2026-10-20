import {
  EMPTY_SIDE_STATS,
  type EventType,
  type MatchEvent,
  type MatchPhase,
  type MatchSnapshot,
  type Side,
  type SideStats,
  type TeamInfo,
} from "../model";
import type { ParsedMatch } from "./espn";

// A scripted match. Replays run through exactly the same runner as a live match,
// so the demo page exercises the real code path rather than a side door.

export interface ReplayScript {
  id: string;
  title: string;
  blurb: string;
  league: string;
  home: TeamInfo;
  away: TeamInfo;
  /** Minute the final whistle is blown, e.g. 94. */
  endMinute: number;
  events: { minute: number; type: EventType; side: Side | null }[];
  /** [minute, home possession %] control points, linearly interpolated. */
  possession: [number, number][];
}

const interp = (points: [number, number][], m: number) => {
  if (!points.length) return 50;
  if (m <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [m1, v1] = points[i];
    const [m0, v0] = points[i - 1];
    if (m <= m1) return v0 + ((v1 - v0) * (m - m0)) / (m1 - m0 || 1);
  }
  return points[points.length - 1][1];
};

export function phaseAt(script: ReplayScript, minute: number): MatchPhase {
  if (minute < 0) return "scheduled";
  if (minute >= script.endMinute) return "full_time";
  if (minute < 45.5) return "first_half";
  if (minute < 47) return "half_time";
  return "second_half";
}

const count = (
  events: ReplayScript["events"],
  side: Side,
  types: EventType[],
) => events.filter((e) => e.side === side && types.includes(e.type)).length;

/**
 * The match as it would look from the feed at `minute`. `startMs` is the real-world
 * time of kick-off; event wallclocks are startMs + minute * 60s, so a demo driver
 * can run faster by moving `startMs` and `now` together.
 */
export function replayAt(
  script: ReplayScript,
  minute: number,
  startMs: number,
): ParsedMatch {
  const done = script.events.filter((e) => e.minute <= minute);
  const stats = (side: Side): SideStats => ({
    ...EMPTY_SIDE_STATS,
    possession:
      minute < 0
        ? null
        : Math.round(
            side === "home"
              ? interp(script.possession, minute)
              : 100 - interp(script.possession, minute),
          ),
    shots: count(done, side, ["goal", "penalty_missed"]),
    shotsOnTarget: count(done, side, ["goal", "penalty_missed"]),
    corners: count(done, side, ["corner"]),
    fouls: count(done, side, ["yellow_card", "red_card"]),
    yellowCards: count(done, side, ["yellow_card"]),
    redCards: count(done, side, ["red_card"]),
    offsides: count(done, side, ["offside"]),
  });
  const goals = (side: Side) =>
    done.filter(
      (e) =>
        (e.type === "goal" && e.side === side) ||
        (e.type === "own_goal" && e.side && e.side !== side),
    ).length;

  const snapshot: MatchSnapshot = {
    id: script.id,
    league: script.league,
    phase: phaseAt(script, minute),
    minute: minute < 0 ? null : Math.min(minute, script.endMinute),
    home: script.home,
    away: script.away,
    score: { home: goals("home"), away: goals("away") },
    stats: { home: stats("home"), away: stats("away") },
  };
  const events: MatchEvent[] = done.map((e, i) => ({
    id: `${script.id}:${i}`,
    type: e.type,
    side: e.side,
    minute: e.minute,
    wallclock: startMs + e.minute * 60_000,
  }));
  return { snapshot, events };
}
