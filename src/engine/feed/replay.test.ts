import { describe, expect, test } from "bun:test";
import { initialState, tick } from "../runner";
import { replayAt } from "./replay";
import { SCENARIOS } from "./scenarios";

describe("replay feed", () => {
  const derby = SCENARIOS[0];
  const START = 1_700_000_000_000;

  test("phase and score follow the script", () => {
    expect(replayAt(derby, -5, START).snapshot.phase).toBe("scheduled");
    expect(replayAt(derby, 30, START).snapshot.score).toEqual({
      home: 1,
      away: 0,
    });
    expect(replayAt(derby, 46, START).snapshot.phase).toBe("half_time");
    const end = replayAt(derby, 95, START).snapshot;
    expect(end.phase).toBe("full_time");
    expect(end.score).toEqual({ home: 2, away: 1 });
  });

  test("possession is interpolated and the sides sum to 100", () => {
    const { snapshot } = replayAt(derby, 28, START);
    expect(snapshot.stats.home.possession).toBeGreaterThan(55);
    expect(
      (snapshot.stats.home.possession ?? 0) +
        (snapshot.stats.away.possession ?? 0),
    ).toBe(100);
  });

  test("a no-delay run of every scenario produces one goal effect per goal", () => {
    for (const s of SCENARIOS) {
      let state = initialState("possession");
      let effects = 0;
      for (let m = -1; m <= s.endMinute; m += 0.5) {
        const now = START + m * 60_000;
        const { snapshot, events } = replayAt(s, m, START);
        const r = tick(state, {
          snapshot,
          events,
          now,
          delayMs: 0,
          horizonMs: 0,
        });
        state = r.state;
        effects += r.commands.filter(
          (c) => c.item.kind === "effect" && c.item.effect === "goal",
        ).length;
      }
      const goals = s.events.filter((e) => e.type === "goal").length;
      expect(effects).toBe(goals);
    }
  });
});
