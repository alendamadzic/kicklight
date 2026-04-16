import type { LiveMatch, Match, RateLimitInfo } from "@/types";

const BASE_URL = "https://api.football-data.org/v4";

interface FootballApiResponse<T> {
  data: T;
  rateLimit: RateLimitInfo;
}

function getApiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set. Add it to your .env.local file.",
    );
  }
  return key;
}

async function footballFetch<T>(
  path: string,
  headers?: Record<string, string>,
): Promise<FootballApiResponse<T>> {
  const apiKey = getApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Auth-Token": apiKey,
      ...headers,
    },
    next: { revalidate: 0 },
  });

  const rateLimit: RateLimitInfo = {
    requestsAvailable: Number.parseInt(
      res.headers.get("X-RequestsAvailable") ?? "10",
      10,
    ),
    counterReset: Number.parseInt(
      res.headers.get("X-RequestCounter-Reset") ?? "60",
      10,
    ),
  };

  if (res.status === 429) {
    throw new RateLimitError(rateLimit.counterReset);
  }

  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as T;
  return { data, rateLimit };
}

export class RateLimitError extends Error {
  resetSeconds: number;
  constructor(resetSeconds: number) {
    super(`Rate limited. Resets in ${resetSeconds}s`);
    this.name = "RateLimitError";
    this.resetSeconds = resetSeconds;
  }
}

// --- API types (raw response shapes) ---

interface FootballTeamRaw {
  id: number;
  name: string;
  crest: string;
  clubColors: string | null;
  statistics?: { ball_possession?: number | null };
}

interface FootballMatchRaw {
  id: number;
  homeTeam: FootballTeamRaw;
  awayTeam: FootballTeamRaw;
  competition: { name: string; emblem: string };
  status: string;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  utcDate: string;
  minute?: number | null;
}

interface MatchesResponse {
  matches: FootballMatchRaw[];
}

function mapMatch(raw: FootballMatchRaw): Match {
  return {
    id: raw.id,
    homeTeam: {
      id: raw.homeTeam.id,
      name: raw.homeTeam.name,
      crest: raw.homeTeam.crest,
      clubColors: raw.homeTeam.clubColors ?? "",
    },
    awayTeam: {
      id: raw.awayTeam.id,
      name: raw.awayTeam.name,
      crest: raw.awayTeam.crest,
      clubColors: raw.awayTeam.clubColors ?? "",
    },
    competition: raw.competition,
    status: raw.status as Match["status"],
    score: raw.score,
    utcDate: raw.utcDate,
  };
}

// --- Public API ---

// Competitions to fetch. The general /matches endpoint is restricted on free
// accounts — querying each competition directly and merging is the correct approach.
const FREE_TIER_COMPETITIONS = [
  "CL", // UEFA Champions League
  "PL", // Premier League
];

export async function fetchTodaysMatches(): Promise<{
  matches: Match[];
  rateLimit: RateLimitInfo;
}> {
  const today = new Date().toISOString().split("T")[0];
  const statusFilter = "SCHEDULED,TIMED,LIVE,IN_PLAY,PAUSED,FINISHED";

  const results = await Promise.allSettled(
    FREE_TIER_COMPETITIONS.map((code) =>
      footballFetch<MatchesResponse>(
        `/competitions/${code}/matches?status=${statusFilter}&dateFrom=${today}&dateTo=${today}`,
      ),
    ),
  );

  let lastRateLimit: RateLimitInfo = {
    requestsAvailable: 10,
    counterReset: 60,
  };
  const allMatches: Match[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allMatches.push(...result.value.data.matches.map(mapMatch));
      lastRateLimit = result.value.rateLimit;
    }
    // Silently skip competitions with no matches today (404/no results)
  }

  // Sort by kick-off time
  allMatches.sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
  );

  return { matches: allMatches, rateLimit: lastRateLimit };
}

export async function fetchLiveMatch(
  matchId: number,
): Promise<{ match: LiveMatch; rateLimit: RateLimitInfo }> {
  const { data, rateLimit } = await footballFetch<FootballMatchRaw>(
    `/matches/${matchId}`,
    { "X-Unfold-Goals": "true" },
  );
  const base = mapMatch(data);
  const homePoss = data.homeTeam.statistics?.ball_possession;
  const awayPoss = data.awayTeam.statistics?.ball_possession;
  const possession =
    homePoss != null
      ? { home: homePoss, away: awayPoss ?? 100 - homePoss }
      : awayPoss != null
        ? { home: 100 - awayPoss, away: awayPoss }
        : null;
  const liveMatch: LiveMatch = {
    ...base,
    minute: data.minute ?? null,
    possession,
  };
  return { match: liveMatch, rateLimit };
}

export function calculateGoalSplit(match: LiveMatch): {
  homePct: number;
  isFallback: boolean;
} {
  const homeGoals = match.score.fullTime.home ?? 0;
  const awayGoals = match.score.fullTime.away ?? 0;
  const total = homeGoals + awayGoals;
  if (total === 0) return { homePct: 50, isFallback: true };
  return {
    homePct: Math.round((homeGoals / total) * 100),
    isFallback: false,
  };
}

export function calculatePossessionSplit(match: LiveMatch): {
  homePct: number;
  isFallback: boolean;
} {
  if (match.possession) {
    return { homePct: match.possession.home, isFallback: false };
  }
  return { homePct: 50, isFallback: true };
}

interface TeamDetailRaw {
  clubColors: string | null;
}

export async function fetchTeamColors(
  homeTeamId: number,
  awayTeamId: number,
): Promise<{ home: string; away: string }> {
  const [homeResult, awayResult] = await Promise.allSettled([
    footballFetch<TeamDetailRaw>(`/teams/${homeTeamId}`),
    footballFetch<TeamDetailRaw>(`/teams/${awayTeamId}`),
  ]);
  return {
    home:
      homeResult.status === "fulfilled"
        ? (homeResult.value.data.clubColors ?? "")
        : "",
    away:
      awayResult.status === "fulfilled"
        ? (awayResult.value.data.clubColors ?? "")
        : "",
  };
}
