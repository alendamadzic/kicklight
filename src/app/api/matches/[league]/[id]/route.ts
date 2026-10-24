import type { NextRequest } from "next/server";
import { fetchEspnMatch } from "@/engine/feed/espn";
import { replayAt } from "@/engine/feed/replay";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { MatchResponse } from "@/lib/api-types";
import { apiError, json } from "@/server/http";
import { isKnownLeague } from "@/server/validate";

/** One match as it stands: snapshot and events. No session needed. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/matches/[league]/[id]">,
) {
  const { league, id } = await ctx.params;
  if (league === "replay") {
    // Scripted scenarios: the match as it looks just before kick-off.
    const script = SCENARIOS.find((s) => s.id === id);
    if (!script) return apiError("unknown_scenario", 404);
    return json(replayAt(script, -1, Date.now()) satisfies MatchResponse);
  }
  if (!isKnownLeague(league)) return apiError("unknown_league", 400);
  if (!/^\d{1,12}$/.test(id))
    return apiError("bad_request", 400, "Bad match id");
  try {
    return json((await fetchEspnMatch(league, id)) satisfies MatchResponse);
  } catch (e) {
    return apiError("feed_unavailable", 502, (e as Error).message);
  }
}
