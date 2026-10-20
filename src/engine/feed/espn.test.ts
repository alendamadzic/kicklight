import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/espn-cov-new.json";
import { keyEventType, parseEspnSummary, parseMinute, phaseFrom } from "./espn";

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

describe("phaseFrom", () => {
  test("named statuses", () => {
    expect(phaseFrom("STATUS_SCHEDULED")).toBe("scheduled");
    expect(phaseFrom("STATUS_HALFTIME")).toBe("half_time");
    expect(phaseFrom("STATUS_FULL_TIME")).toBe("full_time");
    expect(phaseFrom("STATUS_SECOND_HALF")).toBe("second_half");
  });
  test("an ambiguous in-progress status takes the half from the period, then the clock", () => {
    expect(phaseFrom("STATUS_IN_PROGRESS", { period: 2, clock: "47'" })).toBe(
      "second_half",
    );
    expect(phaseFrom("STATUS_IN_PROGRESS", { clock: "47'" })).toBe(
      "second_half",
    );
    expect(phaseFrom("STATUS_IN_PROGRESS", { clock: "45'+2'" })).toBe(
      "first_half",
    );
    expect(phaseFrom("STATUS_IN_PROGRESS", { period: 1, clock: "30'" })).toBe(
      "first_half",
    );
  });
  test("an end-of-period marker is never mistaken for the final whistle", () => {
    expect(phaseFrom("STATUS_END_PERIOD", { period: 1, clock: "45'+3'" })).toBe(
      "first_half",
    );
  });
});

describe("espn commentary", () => {
  const { snapshot, events } = parseEspnSummary(fixture, "eng.1");

  test("commentary events are credited to the team the line names", () => {
    const of = (type: string, side: string) =>
      events.filter((e) => e.type === type && e.side === side).length;
    expect(of("corner", "away")).toBe(snapshot.stats.away.corners);
    expect(of("corner", "home")).toBe(snapshot.stats.home.corners);
    expect(
      events.filter((e) => e.side === null && e.type === "corner"),
    ).toEqual([]);
    // Attempts on goal are noise on the strip; only the goals come through.
    expect(events.some((e) => e.type.includes("shot"))).toBe(false);
  });

  test("free kicks near the box stand apart from fouls", () => {
    const fk = events.filter((e) => e.type === "free_kick");
    expect(fk.length).toBeGreaterThan(0);
    // Rudoni wins the first one for Coventry, at home, in the attacking half.
    expect(fk[0].side).toBe("home");
    // One event per free kick: the "wins a free kick" line doesn't double it up.
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Plain fouls are noise; only the dangerous free kicks come through.
    expect(events.some((e) => (e.type as string) === "foul")).toBe(false);
  });

  test("offsides are recognised", () => {
    expect(
      events.filter((e) => e.type === "offside" && e.side === "away").length,
    ).toBe(snapshot.stats.away.offsides);
  });
});
