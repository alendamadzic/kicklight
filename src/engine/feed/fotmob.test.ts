import { describe, expect, test } from "bun:test";
import details from "./__fixtures__/fotmob-avl-mci.json";
import matches from "./__fixtures__/fotmob-matches-20261024.json";
import {
  FOTMOB_LAG_MS,
  findFotmobMatch,
  normaliseTeam,
  parseFotmobEvents,
  placeFotmobEvents,
} from "./fotmob";

describe("fotmob", () => {
  const kickoff = Date.parse("2026-10-24T11:30:00Z");

  test("team names compare without accents and club suffixes", () => {
    expect(normaliseTeam("Atlético Madrid")).toBe("atletico madrid");
    expect(normaliseTeam("AFC Bournemouth")).toBe("bournemouth");
  });

  test("finds the match ESPN is following by kick-off and both teams", () => {
    expect(
      findFotmobMatch(matches, kickoff, "Aston Villa", "Manchester City"),
    ).toBe("5795486");
    // ESPN's short forms still match FotMob's long names.
    expect(
      findFotmobMatch(
        matches,
        Date.parse("2026-10-24T16:30:00Z"),
        "Chelsea",
        "Tottenham",
      ),
    ).toBe("5795487");
  });

  test("no match on the wrong day or with only one team right", () => {
    expect(
      findFotmobMatch(
        matches,
        kickoff + 86_400_000,
        "Aston Villa",
        "Manchester City",
      ),
    ).toBeNull();
    expect(
      findFotmobMatch(matches, kickoff, "Aston Villa", "Arsenal"),
    ).toBeNull();
  });

  test("goals and cards come through with the right side and minute", () => {
    const events = parseFotmobEvents(details);
    expect(events.map((e) => [e.type, e.side, e.minute])).toEqual([
      ["yellow_card", "away", 38],
      ["yellow_card", "away", 32],
      ["goal", "home", 6],
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
  });

  test("a goal belongs to the team whose score it raised, own goals included", () => {
    const own = {
      content: {
        matchFacts: {
          events: {
            events: [
              {
                type: "Goal",
                eventId: 1,
                time: 70,
                // Listed under the home side, but the away score went up.
                isHome: true,
                ownGoal: true,
                homeScore: 1,
                awayScore: 0,
                newScore: [1, 1],
              },
            ],
          },
        },
      },
    };
    expect(parseFotmobEvents(own)[0]).toMatchObject({
      type: "goal",
      side: "away",
    });
  });

  test("a junk payload adds nothing instead of throwing", () => {
    expect(parseFotmobEvents(null)).toEqual([]);
    expect(parseFotmobEvents({ content: { matchFacts: {} } })).toEqual([]);
    expect(findFotmobMatch({}, kickoff, "A", "B")).toBeNull();
  });

  test("events are placed on the real-world clock from ESPN's match clock, never in the future", () => {
    // ESPN read the clock at 62:00 at time T; a card in the 61st minute was ~1.5 minutes ago.
    const T = 1_000_000_000_000;
    const clock = { seconds: 62 * 60, at: T, from: 2700 };
    const [card, latest] = placeFotmobEvents(
      [
        { id: "f1", type: "yellow_card", side: "home", minute: 61 },
        { id: "f2", type: "goal", side: "away", minute: 63 },
      ],
      clock,
      T + 5_000,
    );
    expect(card.wallclock).toBe(T - 90_000);
    expect(card.source).toBe("fotmob");
    // Just seen, in a minute the clock hasn't reached: FotMob's usual lag before it was seen.
    expect(latest.wallclock).toBe(T + 5_000 - FOTMOB_LAG_MS);
  });
});
