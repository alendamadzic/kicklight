import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/espn-cov-new.json";
import { parseEspnSummary } from "./espn";
import { scriptFromRecordings, trimEspnPayload } from "./recorder";
import { replayAt } from "./replay";

describe("scriptFromRecordings", () => {
  const meta = {
    id: "cov-new",
    title: "Coventry v Newcastle",
    blurb: "Recorded",
    league: "eng.1",
  };
  const script = scriptFromRecordings(
    [{ capturedAt: 1, payload: fixture }],
    meta,
  );

  test("carries teams, colours and every goal", () => {
    expect(script.home.name).toBe("Coventry City");
    expect(script.home.color).toBe("#87cced");
    expect(script.events.filter((e) => e.type === "goal")).toHaveLength(5);
  });

  test("the recorded match replays to its real final score", () => {
    const end = replayAt(script, script.endMinute + 1, 0).snapshot;
    expect(end.phase).toBe("full_time");
    expect(end.score).toEqual({ home: 4, away: 1 });
  });

  test("events are in match order and the possession curve is sorted", () => {
    const minutes = script.events.map((e) => e.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    const curve = script.possession.map((p) => p[0]);
    expect(curve).toEqual([...curve].sort((a, b) => a - b));
  });

  test("no recordings is an error, not an empty replay", () => {
    expect(() => scriptFromRecordings([], meta)).toThrow();
  });
});

describe("trimEspnPayload", () => {
  const bloated = {
    ...(fixture as object),
    news: {
      articles: Array.from({ length: 200 }, (_, i) => ({
        i,
        body: "x".repeat(500),
      })),
    },
    odds: [{ provider: "x".repeat(10_000) }],
    rosters: Array.from({ length: 50 }, () => ({ pad: "y".repeat(2_000) })),
  };

  test("drops the bulk but parses to exactly the same match", () => {
    const trimmed = trimEspnPayload(bloated);
    expect(JSON.stringify(trimmed).length).toBeLessThan(
      JSON.stringify(bloated).length / 2,
    );
    expect(parseEspnSummary(trimmed, "eng.1", 1)).toEqual(
      parseEspnSummary(bloated, "eng.1", 1),
    );
  });

  test("a trimmed recording still exports to the real final score", () => {
    const script = scriptFromRecordings(
      [{ capturedAt: 1, payload: trimEspnPayload(bloated) }],
      { id: "t", title: "t", blurb: "", league: "eng.1" },
    );
    const end = replayAt(script, script.endMinute + 1, 0).snapshot;
    expect(end.score).toEqual({ home: 4, away: 1 });
  });
});
