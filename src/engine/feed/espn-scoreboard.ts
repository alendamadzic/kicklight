import type { MatchPhase, Score } from "../model";
import {
  ESPN_HEADERS,
  espnScoreboardUrl,
  kitColor,
  parseMinute,
  phaseFrom,
} from "./espn";

// Fixture lists come from ESPN's scoreboard endpoint: one league, one day. Parsed
// defensively like the summary, and covered by a recorded real response.

export interface ScoreboardTeam {
  id: string;
  name: string;
  short: string;
  /** Primary kit colour, #rrggbb. */
  color: string;
  crest?: string;
}

/** One row of a fixture list. */
export interface ScoreboardMatch {
  id: string;
  league: string;
  /** ISO kick-off time. */
  kickoff: string;
  phase: MatchPhase;
  minute: number | null;
  home: ScoreboardTeam;
  away: ScoreboardTeam;
  score: Score;
}

// biome-ignore lint/suspicious/noExplicitAny: ESPN's response is undocumented; reads are defensive
type Json = any;

function side(c: Json): ScoreboardTeam {
  return {
    id: String(c.team?.id ?? ""),
    name: c.team?.displayName ?? "",
    short: c.team?.abbreviation ?? "",
    color: kitColor(c.team?.color),
    crest: c.team?.logo,
  };
}

export function parseEspnScoreboard(
  json: Json,
  league: string,
): ScoreboardMatch[] {
  const out: ScoreboardMatch[] = [];
  for (const e of json?.events ?? []) {
    const comp = e?.competitions?.[0];
    const home = comp?.competitors?.find((c: Json) => c.homeAway === "home");
    const away = comp?.competitors?.find((c: Json) => c.homeAway === "away");
    if (!home || !away) continue;
    const status = e?.status ?? comp?.status;
    out.push({
      id: String(e.id),
      league,
      kickoff: new Date(e.date).toISOString(),
      phase: phaseFrom(status?.type?.name, {
        period: status?.period,
        clock: status?.displayClock,
      }),
      minute: parseMinute(status?.displayClock),
      home: side(home),
      away: side(away),
      score: { home: Number(home.score) || 0, away: Number(away.score) || 0 },
    });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** A league's fixtures for one day (`yyyymmdd`, ESPN's default day when omitted). */
export async function fetchEspnScoreboard(
  league: string,
  yyyymmdd?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScoreboardMatch[]> {
  const res = await fetchImpl(espnScoreboardUrl(league, yyyymmdd), {
    cache: "no-store",
    headers: ESPN_HEADERS,
  });
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  return parseEspnScoreboard(await res.json(), league);
}
