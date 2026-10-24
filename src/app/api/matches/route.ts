import type { NextRequest } from "next/server";
import { fetchEspnScoreboard } from "@/engine/feed/espn-scoreboard";
import type { MatchesResponse } from "@/lib/api-types";
import { apiError, json } from "@/server/http";
import { isKnownLeague } from "@/server/validate";

/**
 * Public and the same for everyone, and every open fixtures page polls it for every league:
 * let the CDN answer repeats for a few seconds instead of passing each one on to ESPN.
 */
const CACHE = {
  "cache-control": "public, s-maxage=15, stale-while-revalidate=30",
};

/** A league's fixtures for a day (`date=YYYYMMDD`, today by default). */
export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league") ?? "eng.1";
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  if (!isKnownLeague(league)) return apiError("unknown_league", 400);
  if (date && !/^\d{8}$/.test(date))
    return apiError("bad_request", 400, "Use date=YYYYMMDD");
  try {
    const matches = await fetchEspnScoreboard(league, date);
    return json({ matches } satisfies MatchesResponse, 200, CACHE);
  } catch (e) {
    return apiError("feed_unavailable", 502, (e as Error).message);
  }
}
