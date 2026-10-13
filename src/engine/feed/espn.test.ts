import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/espn-cov-new.json";
import { keyEventType, parseEspnSummary, parseMinute } from "./espn";

describe("espn parser", () => {
  const { snapshot, events } = parseEspnSummary(fixture, "eng.1");

  test("minute strings, including added time", () => {
    expect(parseMinute("45'+3'")).toBe(48);
    expect(parseMinute("67'")).toBe(67);
    expect(parseMinute("")).toBeNull();
  });

  test("teams, colours and score come from the header", () => {
    expect(snapshot.home.name).toBe("Coventry City");
    expect(snapshot.home.color).toBe("#87cced");
    expect(snapshot.away.name).toBe("Newcastle United");
    expect(snapshot.away.alternateColor).toBe("#0b1b3d");
    expect(snapshot.score).toEqual({ home: 4, away: 1 });
    expect(snapshot.phase).toBe("full_time");
  });

  test("statistics map onto the right sides", () => {
    expect(snapshot.stats.home.possession).toBeCloseTo(33.3);
    expect(snapshot.stats.away.possession).toBeCloseTo(66.7);
    expect(snapshot.stats.away.shots).toBe(19);
    expect(snapshot.stats.home.shotsOnTarget).toBe(6);
    expect(snapshot.stats.away.corners).toBe(6);
  });

  test("a scored penalty is a goal for the right team, once", () => {
    const early = events.filter((e) => e.type === "goal" && e.minute === 6);
    expect(early).toHaveLength(1);
    expect(early[0].side).toBe("home");
  });

  test("goal events match the final score", () => {
    const goals = events.filter((e) => e.type === "goal");
    expect(goals.filter((g) => g.side === "home")).toHaveLength(
      snapshot.score.home,
    );
    expect(goals.filter((g) => g.side === "away")).toHaveLength(
      snapshot.score.away,
    );
  });

  test("events are unique, ordered, and carry a wallclock", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].wallclock).toBeGreaterThanOrEqual(
        events[i - 1].wallclock,
      );
    }
    expect(events.every((e) => e.wallclock > 1.7e12)).toBe(true);
  });

  test("yellow cards, kickoff and half time are recognised", () => {
    expect(events.filter((e) => e.type === "yellow_card")).toHaveLength(2);
    expect(events.some((e) => e.type === "kickoff")).toBe(true);
    expect(events.some((e) => e.type === "half_time")).toBe(true);
  });

  test("slug mapping", () => {
    expect(keyEventType("penalty---scored", true)).toBe("goal");
    expect(keyEventType("penalty---saved", false)).toBe("penalty_missed");
    expect(keyEventType("red-card", false)).toBe("red_card");
    expect(keyEventType("start-delay", false)).toBeNull();
  });
});
