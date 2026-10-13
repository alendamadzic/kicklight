import {
  ESPN_HEADERS,
  espnScoreboardUrl,
  parseMinute,
  phaseFrom,
} from "@/engine/feed/espn";
import type { MatchListItem } from "@/lib/api-types";

// Fixture lists come from ESPN's scoreboard endpoint. Parsed defensively and
// covered by a recorded real response.

// biome-ignore lint/suspicious/noExplicitAny: ESPN's response is undocumented; reads are defensive
type Json = any;

const hex = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{6}$/i.test(v)
    ? `#${v.toLowerCase()}`
    : "#888888";

export function parseEspnScoreboard(
  json: Json,
  league: string,
): MatchListItem[] {
  const out: MatchListItem[] = [];
  for (const e of json?.events ?? []) {
    const comp = e?.competitions?.[0];
    const home = comp?.competitors?.find((c: Json) => c.homeAway === "home");
    const away = comp?.competitors?.find((c: Json) => c.homeAway === "away");
    if (!home || !away) continue;
    const side = (c: Json) => ({
      id: String(c.team?.id ?? ""),
      name: c.team?.displayName ?? "",
      short: c.team?.abbreviation ?? "",
      color: hex(c.team?.color),
      crest: c.team?.logo,
    });
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

export async function fetchMatches(
  league: string,
  yyyymmdd?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MatchListItem[]> {
  const res = await fetchImpl(espnScoreboardUrl(league, yyyymmdd), {
    cache: "no-store",
    headers: ESPN_HEADERS,
  });
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  return parseEspnScoreboard(await res.json(), league);
}
