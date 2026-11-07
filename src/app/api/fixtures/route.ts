import type { NextRequest } from "next/server";
import { apiError, json } from "@/server/http";
import { getFixtures } from "@/server/match-data";

/**
 * The same for everyone and polled by every open fixtures page: the CDN answers repeats,
 * and behind it the server's cache asks ESPN at most once per window.
 */
const CACHE = {
  "cache-control": "public, s-maxage=15, stale-while-revalidate=30",
};

/** Every league's fixtures for a day (`date=YYYYMMDD`). */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{8}$/.test(date))
    return apiError("bad_request", 400, "Use date=YYYYMMDD");
  try {
    return json(await getFixtures(date), 200, CACHE);
  } catch (e) {
    return apiError("feed_unavailable", 502, (e as Error).message);
  }
}
