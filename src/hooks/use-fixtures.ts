"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { MatchListItem } from "@/lib/api-types";
import { REPLAY_LEAGUE, sampleMatches } from "@/lib/sample-data";
import { fixturesKey } from "@/lib/swr-keys";
import { rememberTeams } from "@/lib/team-cache";
import { useDateKey } from "./use-visitor-day";

export type FixturesSource = "api" | "sample";
export type SampleReason = "unavailable" | null;

export interface FixturesState {
  /** Matches by league slug, in LEAGUES order. */
  byLeague: Record<string, MatchListItem[]>;
  loading: boolean;
  source: FixturesSource;
  reason: SampleReason;
}

const POLL_MS = 30_000;

interface Fixtures {
  byLeague: Record<string, MatchListItem[]>;
  source: FixturesSource;
  reason: SampleReason;
}

/**
 * Fixtures for a day across every league, one request, refreshed every 30 s. The server
 * usually renders the first answer into the page. With no answer at all it falls back to
 * sample matches built from the scripted scenarios, so the page is never empty; a refresh
 * that fails keeps showing the last good list.
 */
export function useFixtures(dayOffset: number): FixturesState {
  const date = useDateKey(dayOffset);
  // Days that have had a real answer: a failed refresh of one keeps its list.
  const loaded = useRef(new Set<string>());

  const { data, isLoading } = useSWR(
    date ? fixturesKey(date) : null,
    async ([, day]: readonly [string, string]): Promise<Fixtures> => {
      try {
        const { byLeague } = await api.fixtures(day);
        loaded.current.add(day);
        return { byLeague, source: "api", reason: null };
      } catch (e) {
        if (loaded.current.has(day)) throw e;
        return {
          byLeague: { [REPLAY_LEAGUE]: sampleMatches() },
          source: "sample",
          reason: "unavailable",
        };
      }
    },
    {
      refreshInterval: POLL_MS,
      keepPreviousData: false,
      // A day the server already rendered isn't fetched again on mount; polling takes over.
      revalidateIfStale: false,
    },
  );

  useEffect(() => {
    if (date && data?.source === "api") {
      loaded.current.add(date);
      rememberTeams(
        Object.values(data.byLeague).flatMap((list) =>
          list.flatMap((m) => [m.home, m.away]),
        ),
      );
    }
  }, [date, data]);

  return {
    byLeague: data?.byLeague ?? {},
    loading: !date || isLoading,
    source: data?.source ?? "api",
    reason: data?.reason ?? null,
  };
}

/** Flatten for search. */
export function useAllMatches(byLeague: Record<string, MatchListItem[]>) {
  return useMemo(() => Object.values(byLeague).flat(), [byLeague]);
}
