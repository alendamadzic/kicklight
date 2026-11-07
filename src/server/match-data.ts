import "server-only";
import { cacheLife } from "next/cache";
import { fetchEspnMatch } from "@/engine/feed/espn";
import { fetchEspnScoreboard } from "@/engine/feed/espn-scoreboard";
import { LEAGUES } from "@/engine/feed/leagues";
import type { FixturesResponse, MatchResponse } from "@/lib/api-types";

// Match data the UI reads, cached and shared by every visitor (profiles in next.config.ts).
// The session loop never reads these: the strip always works from a fresh feed.

/**
 * Every league's fixtures for one day (YYYYMMDD), leagues with no matches left out.
 * Throws when no league answered, so a failed fetch is never cached as an empty day.
 */
export async function getFixtures(date: string): Promise<FixturesResponse> {
  "use cache";
  cacheLife("fixtures");
  const results = await Promise.allSettled(
    LEAGUES.map((l) => fetchEspnScoreboard(l.slug, date)),
  );
  const byLeague: FixturesResponse["byLeague"] = {};
  let answered = false;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    answered = true;
    if (r.value.length) byLeague[LEAGUES[i].slug] = r.value;
  });
  if (!answered) throw new Error("No league answered");
  return { byLeague };
}

/** One match from the feed as it stands, for the remote's preview. */
export async function getMatch(
  league: string,
  id: string,
): Promise<MatchResponse> {
  "use cache";
  cacheLife("match");
  return fetchEspnMatch(league, id);
}
