import { expect, test } from "bun:test";
import details from "@/engine/feed/__fixtures__/fotmob-avl-mci.json";
import matches from "@/engine/feed/__fixtures__/fotmob-matches-20261024.json";
import type { ParsedMatch } from "@/engine/model";
import { EMPTY_SIDE_STATS, type MatchPhase } from "@/engine/model";
import { withFotmob } from "./fotmob";

const T = Date.parse("2026-10-24T12:20:00Z");

const espn = (phase: MatchPhase): ParsedMatch => {
  const team = (name: string) => ({
    id: name,
    name,
    short: name,
    color: "#000000",
    alternateColor: "#ffffff",
  });
  return {
    snapshot: {
      id: "401879256",
      league: "eng.1",
      phase,
      minute: 40,
      clock: { seconds: 40 * 60, at: T, running: true, from: 0 },
      kickoff: Date.parse("2026-10-24T11:30:00Z"),
      home: team("Aston Villa"),
      away: team("Manchester City"),
      score: { home: 1, away: 0 },
      stats: { home: EMPTY_SIDE_STATS, away: EMPTY_SIDE_STATS },
    },
    // ESPN hasn't posted the 38th-minute card yet.
    events: [
      { id: "k1", type: "goal", side: "home", minute: 6, wallclock: T - 2e6 },
    ],
  };
};

const fakeFetch = (calls: string[], fail = false) =>
  (async (url: string) => {
    calls.push(String(url));
    if (fail) return new Response("no", { status: 403 });
    const body = String(url).includes("matchDetails") ? details : matches;
    return Response.json(body);
  }) as unknown as typeof fetch;

test("FotMob's goals and cards are added to the ESPN read, placed on the match clock", async () => {
  const calls: string[] = [];
  const r = await withFotmob(
    "eng.1/a",
    espn("first_half"),
    fakeFetch(calls),
    T,
  );
  const card = r.events.find((e) => e.source === "fotmob" && e.minute === 38);
  expect(card).toMatchObject({ type: "yellow_card", side: "away" });
  // Two and a half minutes before the clock read 40:00.
  expect(card?.wallclock).toBe(T - 150_000);
  expect(r.events.filter((e) => e.source !== "fotmob")).toHaveLength(1);
  expect(calls[0]).toContain("matches?date=20261024");
  expect(calls[1]).toContain("matchId=5795486");
});

test("the FotMob match is looked up once, then only its details are read", async () => {
  const calls: string[] = [];
  await withFotmob("eng.1/b", espn("first_half"), fakeFetch(calls), T);
  await withFotmob("eng.1/b", espn("first_half"), fakeFetch(calls), T + 3_000);
  expect(calls.filter((c) => c.includes("matches?date"))).toHaveLength(1);
  expect(calls.filter((c) => c.includes("matchDetails"))).toHaveLength(2);
});

test("outside play FotMob isn't asked, and a FotMob failure leaves the ESPN read as it was", async () => {
  const calls: string[] = [];
  const ht = espn("half_time");
  expect(await withFotmob("eng.1/c", ht, fakeFetch(calls), T)).toBe(ht);
  expect(calls).toHaveLength(0);
  const live = espn("second_half");
  expect(await withFotmob("eng.1/d", live, fakeFetch(calls, true), T)).toBe(
    live,
  );
});
