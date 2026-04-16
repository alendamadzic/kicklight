"use server";

import {
  fetchLiveMatch,
  fetchTeamColors,
  fetchTodaysMatches,
  RateLimitError,
} from "@/lib/football";
import type { LiveMatch, Match, RateLimitInfo } from "@/types";

export async function getTodaysMatches(): Promise<{
  matches: Match[];
  rateLimit: RateLimitInfo | null;
  error?: string;
}> {
  try {
    const result = await fetchTodaysMatches();
    return { matches: result.matches, rateLimit: result.rateLimit };
  } catch (e) {
    if (e instanceof RateLimitError) {
      return {
        matches: [],
        rateLimit: { requestsAvailable: 0, counterReset: e.resetSeconds },
        error: e.message,
      };
    }
    return {
      matches: [],
      rateLimit: null,
      error: e instanceof Error ? e.message : "Failed to fetch matches",
    };
  }
}

export async function getTeamColors(
  homeTeamId: number,
  awayTeamId: number,
): Promise<{ home: string; away: string }> {
  try {
    return await fetchTeamColors(homeTeamId, awayTeamId);
  } catch {
    return { home: "", away: "" };
  }
}

export async function getLiveMatch(matchId: number): Promise<{
  match: LiveMatch | null;
  rateLimit: RateLimitInfo | null;
  error?: string;
}> {
  try {
    const result = await fetchLiveMatch(matchId);
    return { match: result.match, rateLimit: result.rateLimit };
  } catch (e) {
    if (e instanceof RateLimitError) {
      return {
        match: null,
        rateLimit: { requestsAvailable: 0, counterReset: e.resetSeconds },
        error: e.message,
      };
    }
    return {
      match: null,
      rateLimit: null,
      error: e instanceof Error ? e.message : "Failed to fetch match",
    };
  }
}
