import type { NextRequest } from "next/server";
import { LEAGUES } from "@/engine/feed/leagues";
import { apiError, json } from "@/server/auth";
import { fetchMatches } from "@/server/matches";

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league") ?? "eng.1";
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  if (!LEAGUES.some((l) => l.slug === league))
    return apiError("unknown_league", 400);
  if (date && !/^\d{8}$/.test(date))
    return apiError("bad_date", 400, "Use YYYYMMDD");
  try {
    return json({ matches: await fetchMatches(league, date) });
  } catch (e) {
    return apiError("feed_unavailable", 502, (e as Error).message);
  }
}
