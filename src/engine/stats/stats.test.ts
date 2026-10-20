import { describe, expect, test } from "bun:test";
import {
  EMPTY_SIDE_STATS,
  type MatchEvent,
  type MatchSnapshot,
} from "@/engine/model";
import { STAT_MODES, type StatContext, share } from "@/engine/stats";

function snap(over: Partial<MatchSnapshot> = {}): MatchSnapshot {
  const team = (id: string) => ({
    id,
    name: id,
    short: id,
    color: "#ff0000",
    alternateColor: "#ffffff",
  });
  return {
    id: "m",
    league: "eng.1",
    phase: "second_half",
    minute: 60,
    home: team("H"),
    away: team("A"),
    score: { home: 0, away: 0 },
    stats: { home: { ...EMPTY_SIDE_STATS }, away: { ...EMPTY_SIDE_STATS } },
    ...over,
  };
}

const ctx = (
  snapshot: MatchSnapshot,
  events: MatchEvent[] = [],
): StatContext => ({
  snapshot,
  events,
});

describe("stat modes", () => {
  test("share is 50/50 with no data", () => {
    expect(share(0, 0)).toBe(0.5);
    expect(share(3, 1)).toBe(0.75);
  });

  test("possession reads the feed and falls back from the away side", () => {
    const s = snap();
    s.stats.home.possession = 70;
    expect(STAT_MODES.possession.homeShare(ctx(s))).toBeCloseTo(0.7);
    const t = snap();
    t.stats.away.possession = 30;
    expect(STAT_MODES.possession.homeShare(ctx(t))).toBeCloseTo(0.7);
    expect(STAT_MODES.possession.homeShare(ctx(snap()))).toBe(0.5);
  });

  test("scoreline: level is 50/50, each goal is worth 15 points, capped at 90/10", () => {
    expect(STAT_MODES.scoreline.homeShare(ctx(snap()))).toBe(0.5);
    expect(
      STAT_MODES.scoreline.homeShare(
        ctx(snap({ score: { home: 1, away: 0 } })),
      ),
    ).toBeCloseTo(0.65);
    expect(
      STAT_MODES.scoreline.homeShare(
        ctx(snap({ score: { home: 7, away: 0 } })),
      ),
    ).toBe(0.9);
    expect(
      STAT_MODES.scoreline.homeShare(
        ctx(snap({ score: { home: 0, away: 7 } })),
      ),
    ).toBeCloseTo(0.1);
  });

  test("momentum: recent away pressure outweighs old home pressure", () => {
    const events: MatchEvent[] = [
      { id: "1", type: "goal", side: "home", minute: 20, wallclock: 0 },
      { id: "2", type: "free_kick", side: "away", minute: 58, wallclock: 0 },
      { id: "3", type: "corner", side: "away", minute: 59, wallclock: 0 },
    ];
    expect(STAT_MODES.momentum.homeShare(ctx(snap(), events))).toBeLessThan(
      0.5,
    );
  });

  test("momentum: an own goal is credited to the other side", () => {
    const events: MatchEvent[] = [
      { id: "1", type: "own_goal", side: "home", minute: 59, wallclock: 0 },
    ];
    expect(STAT_MODES.momentum.homeShare(ctx(snap(), events))).toBeLessThan(
      0.5,
    );
  });

  test("dominance blends possession, on-target, shots and corners", () => {
    const s = snap();
    s.stats.home = {
      ...s.stats.home,
      possession: 60,
      shotsOnTarget: 4,
      shots: 10,
      corners: 5,
    };
    s.stats.away = {
      ...s.stats.away,
      possession: 40,
      shotsOnTarget: 1,
      shots: 4,
      corners: 1,
    };
    const v = STAT_MODES.dominance.homeShare(ctx(s));
    expect(v).toBeGreaterThan(0.6);
    expect(v).toBeLessThan(0.9);
  });

  test("discipline: the more-penalised side gets less strip", () => {
    const s = snap();
    s.stats.home.redCards = 1;
    expect(STAT_MODES.discipline.homeShare(ctx(s))).toBeLessThan(0.5);
  });
});
