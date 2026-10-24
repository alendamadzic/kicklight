import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/espn-scoreboard-eng1.json";
import { fetchEspnScoreboard, parseEspnScoreboard } from "./espn-scoreboard";

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

describe("feed requests", () => {
  test("send an explicit user-agent, because ESPN 403s some runtimes' defaults", async () => {
    let seen: Headers | null = null;
    const f = (async (_u: string | URL | Request, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response(JSON.stringify({ events: [] }));
    }) as typeof fetch;
    await fetchEspnScoreboard("eng.1", undefined, f);
    expect(seen).not.toBeNull();
    expect((seen as unknown as Headers).get("user-agent")).toBe(
      "Mozilla/5.0 (compatible; Kicklight)",
    );
  });
});
