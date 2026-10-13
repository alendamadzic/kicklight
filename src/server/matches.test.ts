import { describe, expect, test } from "bun:test";
import fixture from "@/engine/feed/__fixtures__/espn-scoreboard-eng1.json";
import { parseEspnScoreboard } from "./matches";

describe("scoreboard parser", () => {
  const list = parseEspnScoreboard(fixture, "eng.1");
  test("reads fixtures with teams, colours and score", () => {
    expect(list).toHaveLength(1);
    const m = list[0];
    expect(m.id).toBe("401879267");
    expect(m.home.name).toBe("Coventry City");
    expect(m.home.color).toBe("#87cced");
    expect(m.score).toEqual({ home: 4, away: 1 });
    expect(m.phase).toBe("full_time");
    expect(m.minute).toBe(94);
    expect(m.kickoff).toBe("2026-10-12T19:00:00.000Z");
  });
  test("an empty scoreboard is an empty list", () => {
    expect(parseEspnScoreboard({ events: [] }, "eng.1")).toEqual([]);
    expect(parseEspnScoreboard({}, "eng.1")).toEqual([]);
  });
});
