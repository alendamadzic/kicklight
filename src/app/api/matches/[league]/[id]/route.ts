import { fetchEspnMatch } from "@/engine/feed/espn";
import { LEAGUES } from "@/engine/feed/leagues";
import { replayAt } from "@/engine/feed/replay";
import { SCENARIOS } from "@/engine/feed/scenarios";
import { apiError, json } from "@/server/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ league: string; id: string }> },
) {
  const { league, id } = await params;
  if (league === "replay") {
    // Scripted scenarios: the match as it looks just before kick-off.
    const script = SCENARIOS.find((s) => s.id === id);
    if (!script) return apiError("unknown_scenario", 404);
    return json(replayAt(script, -1, Date.now()));
  }
  if (!LEAGUES.some((l) => l.slug === league))
    return apiError("unknown_league", 400);
  if (!/^\d{1,12}$/.test(id)) return apiError("bad_id", 400);
  try {
    return json(await fetchEspnMatch(league, id));
  } catch (e) {
    return apiError("feed_unavailable", 502, (e as Error).message);
  }
}
