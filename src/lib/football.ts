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
  statistics?: {
    ball_possession?: number | null;
    shots?: number | null;
    shots_on_goal?: number | null;
    shots_off_goal?: number | null;
    corner_kicks?: number | null;
    free_kicks?: number | null;
    goal_kicks?: number | null;
    throw_ins?: number | null;
    offsides?: number | null;
    fouls?: number | null;
    saves?: number | null;
    yellow_cards?: number | null;
    yellow_red_cards?: number | null;
    red_cards?: number | null;
  };
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

function pairStat(
  home: number | null | undefined,
  away: number | null | undefined,
): { home: number; away: number } | null {
  if (home == null && away == null) return null;
  return { home: home ?? 0, away: away ?? 0 };
}

export async function fetchLiveMatch(
  matchId: number,
): Promise<{ match: LiveMatch; rateLimit: RateLimitInfo }> {
  const { data, rateLimit } = await footballFetch<FootballMatchRaw>(
    `/matches/${matchId}`,
    { "X-Unfold-Goals": "true" },
  );
  const base = mapMatch(data);
  const hs = data.homeTeam.statistics;
  const as_ = data.awayTeam.statistics;
  console.log("[kicklight] raw stats homeTeam:", JSON.stringify(hs));
  console.log("[kicklight] raw stats awayTeam:", JSON.stringify(as_));
  const homePoss = hs?.ball_possession;
  const awayPoss = as_?.ball_possession;
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
    shots: pairStat(hs?.shots, as_?.shots),
    shotsOnGoal: pairStat(hs?.shots_on_goal, as_?.shots_on_goal),
    shotsOffGoal: pairStat(hs?.shots_off_goal, as_?.shots_off_goal),
    cornerKicks: pairStat(hs?.corner_kicks, as_?.corner_kicks),
    freeKicks: pairStat(hs?.free_kicks, as_?.free_kicks),
    goalKicks: pairStat(hs?.goal_kicks, as_?.goal_kicks),
    throwIns: pairStat(hs?.throw_ins, as_?.throw_ins),
    offsides: pairStat(hs?.offsides, as_?.offsides),
    fouls: pairStat(hs?.fouls, as_?.fouls),
    saves: pairStat(hs?.saves, as_?.saves),
    yellowCards: pairStat(hs?.yellow_cards, as_?.yellow_cards),
    yellowRedCards: pairStat(hs?.yellow_red_cards, as_?.yellow_red_cards),
    redCards: pairStat(hs?.red_cards, as_?.red_cards),
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

function makeCountSplit(field: keyof LiveMatch) {
  return (match: LiveMatch): { homePct: number; isFallback: boolean } => {
    const stat = match[field] as { home: number; away: number } | null;
    const h = stat?.home ?? 0;
    const a = stat?.away ?? 0;
    const total = h + a;
    if (total === 0) return { homePct: 50, isFallback: true };
    return { homePct: Math.round((h / total) * 100), isFallback: false };
  };
}

function makeCountValues(field: keyof LiveMatch) {
  return (match: LiveMatch): { home: string | null; away: string | null } => {
    const stat = match[field] as { home: number; away: number } | null;
    return {
      home: String(stat?.home ?? 0),
      away: String(stat?.away ?? 0),
    };
  };
}

export interface StatConfig {
  key: string;
  label: string;
  calculate: (match: LiveMatch) => { homePct: number; isFallback: boolean };
  getValues: (match: LiveMatch) => { home: string | null; away: string | null };
  fallbackText: string;
  activeText: string;
  showTeamLabels: boolean;
}

export const ALL_STATS = [
  {
    key: "goals" as const,
    label: "Goals",
    calculate: calculateGoalSplit,
    getValues: (match: LiveMatch) => ({
      home: String(match.score.fullTime.home ?? 0),
      away: String(match.score.fullTime.away ?? 0),
    }),
    fallbackText: "No goals yet — showing 50/50",
    activeText: "Split by goals scored",
    showTeamLabels: true,
  },
  {
    key: "possession" as const,
    label: "Possession",
    calculate: calculatePossessionSplit,
    getValues: () => ({ home: null, away: null }),
    fallbackText: "No possession data yet — showing 50/50",
    activeText: "Live possession",
    showTeamLabels: false,
  },
  {
    key: "shots" as const,
    label: "Shots",
    calculate: makeCountSplit("shots"),
    getValues: makeCountValues("shots"),
    fallbackText: "No shots data yet — showing 50/50",
    activeText: "Split by shots",
    showTeamLabels: false,
  },
  {
    key: "shotsOnGoal" as const,
    label: "Shots on Goal",
    calculate: makeCountSplit("shotsOnGoal"),
    getValues: makeCountValues("shotsOnGoal"),
    fallbackText: "No shots on goal data yet — showing 50/50",
    activeText: "Split by shots on goal",
    showTeamLabels: false,
  },
  {
    key: "shotsOffGoal" as const,
    label: "Shots off Goal",
    calculate: makeCountSplit("shotsOffGoal"),
    getValues: makeCountValues("shotsOffGoal"),
    fallbackText: "No shots off goal data yet — showing 50/50",
    activeText: "Split by shots off goal",
    showTeamLabels: false,
  },
  {
    key: "cornerKicks" as const,
    label: "Corner Kicks",
    calculate: makeCountSplit("cornerKicks"),
    getValues: makeCountValues("cornerKicks"),
    fallbackText: "No corner kicks data yet — showing 50/50",
    activeText: "Split by corner kicks",
    showTeamLabels: false,
  },
  {
    key: "freeKicks" as const,
    label: "Free Kicks",
    calculate: makeCountSplit("freeKicks"),
    getValues: makeCountValues("freeKicks"),
    fallbackText: "No free kicks data yet — showing 50/50",
    activeText: "Split by free kicks",
    showTeamLabels: false,
  },
  {
    key: "goalKicks" as const,
    label: "Goal Kicks",
    calculate: makeCountSplit("goalKicks"),
    getValues: makeCountValues("goalKicks"),
    fallbackText: "No goal kicks data yet — showing 50/50",
    activeText: "Split by goal kicks",
    showTeamLabels: false,
  },
  {
    key: "throwIns" as const,
    label: "Throw-ins",
    calculate: makeCountSplit("throwIns"),
    getValues: makeCountValues("throwIns"),
    fallbackText: "No throw-ins data yet — showing 50/50",
    activeText: "Split by throw-ins",
    showTeamLabels: false,
  },
  {
    key: "offsides" as const,
    label: "Offsides",
    calculate: makeCountSplit("offsides"),
    getValues: makeCountValues("offsides"),
    fallbackText: "No offsides data yet — showing 50/50",
    activeText: "Split by offsides",
    showTeamLabels: false,
  },
  {
    key: "fouls" as const,
    label: "Fouls",
    calculate: makeCountSplit("fouls"),
    getValues: makeCountValues("fouls"),
    fallbackText: "No fouls data yet — showing 50/50",
    activeText: "Split by fouls",
    showTeamLabels: false,
  },
  {
    key: "saves" as const,
    label: "Saves",
    calculate: makeCountSplit("saves"),
    getValues: makeCountValues("saves"),
    fallbackText: "No saves data yet — showing 50/50",
    activeText: "Split by saves",
    showTeamLabels: false,
  },
  {
    key: "yellowCards" as const,
    label: "Yellow Cards",
    calculate: makeCountSplit("yellowCards"),
    getValues: makeCountValues("yellowCards"),
    fallbackText: "No yellow cards data yet — showing 50/50",
    activeText: "Split by yellow cards",
    showTeamLabels: false,
  },
  {
    key: "yellowRedCards" as const,
    label: "Yellow-Red Cards",
    calculate: makeCountSplit("yellowRedCards"),
    getValues: makeCountValues("yellowRedCards"),
    fallbackText: "No yellow-red cards data yet — showing 50/50",
    activeText: "Split by yellow-red cards",
    showTeamLabels: false,
  },
  {
    key: "redCards" as const,
    label: "Red Cards",
    calculate: makeCountSplit("redCards"),
    getValues: makeCountValues("redCards"),
    fallbackText: "No red cards data yet — showing 50/50",
    activeText: "Split by red cards",
    showTeamLabels: false,
  },
] satisfies StatConfig[];

export type StatKey = (typeof ALL_STATS)[number]["key"];

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
