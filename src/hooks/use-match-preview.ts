"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { MatchResponse } from "@/lib/api-types";
import { REPLAY_LEAGUE, sampleMatch } from "@/lib/sample-data";
import { matchKey } from "@/lib/swr-keys";
import { rememberTeams } from "@/lib/team-cache";

export interface MatchPreviewState {
  data: MatchResponse | null;
  loading: boolean;
  /** "sample" when it came from the scripted fixtures rather than the feed. */
  source: "api" | "sample" | null;
  retry: () => void;
}

const POLL_MS = 20_000;

interface Preview {
  match: MatchResponse;
  source: "api" | "sample";
}

/** The feed's view of the match; scripted ones (or any the feed can't give) come from samples. */
async function loadPreview(league: string, id: string): Promise<Preview> {
  if (league !== REPLAY_LEAGUE) {
    try {
      return { match: await api.match(league, id), source: "api" };
    } catch (e) {
      const sample = sampleMatch(id);
      if (!sample) throw e;
      return { match: sample, source: "sample" };
    }
  }
  const sample = sampleMatch(id);
  if (!sample) throw new Error(`Unknown sample match ${id}`);
  return { match: sample, source: "sample" };
}

/**
 * GET /api/matches/[league]/[id], refreshed every 20 s until full time. The server usually
 * renders the first answer into the page, so a seeded match isn't fetched again on mount.
 */
export function useMatchPreview(league: string, id: string): MatchPreviewState {
  const { data, isLoading, mutate } = useSWR(
    matchKey(league, id),
    () => loadPreview(league, id),
    {
      refreshInterval: (latest) =>
        latest?.match.snapshot.phase === "full_time" ? 0 : POLL_MS,
      revalidateIfStale: false,
    },
  );
  // Summaries carry both kit colours; Setup's strip colour picker offers the alternate.
  const snapshot = data?.source === "api" ? data.match.snapshot : null;
  useEffect(() => {
    if (snapshot) rememberTeams([snapshot.home, snapshot.away]);
  }, [snapshot]);
  const retry = useCallback(() => void mutate(), [mutate]);
  return {
    data: data?.match ?? null,
    loading: isLoading,
    source: data?.source ?? null,
    retry,
  };
}
