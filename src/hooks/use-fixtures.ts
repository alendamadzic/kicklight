"use client";

import { useMemo, useRef } from "react";
import useSWR from "swr";
import { LEAGUES } from "@/engine/feed/leagues";
import { ApiRequestError, api } from "@/lib/api";
import type { MatchListItem } from "@/lib/api-types";
import { dateKey } from "@/lib/format";
import { REPLAY_LEAGUE, sampleMatches } from "@/lib/sample-data";
import { rememberTeams } from "@/lib/team-cache";

export type FixturesSource = "api" | "sample";
export type SampleReason = "signed_out" | "unavailable" | null;

export interface FixturesState {
  /** Matches by league slug, in LEAGUES order. */
  byLeague: Record<string, MatchListItem[]>;
  loading: boolean;
  source: FixturesSource;
  reason: SampleReason;
}

const POLL_MS = 30_000;
const ALL_SLUGS = LEAGUES.map((l) => l.slug);

interface Fixtures {
  byLeague: Record<string, MatchListItem[]>;
  source: FixturesSource;
  reason: SampleReason;
}

/** One day across the given leagues. With no answer at all, the scripted sample matches. */
async function loadDay(date: string, slugs: string[]): Promise<Fixtures> {
  const results = await Promise.allSettled(
    slugs.map((s) => api.matches(s, date)),
  );
  const byLeague: Record<string, MatchListItem[]> = {};
  let answered = false;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    answered = true;
    if (r.value.matches.length) byLeague[slugs[i]] = r.value.matches;
  });
  if (!answered) {
    const unauth = results.some(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof ApiRequestError &&
        r.reason.unauthenticated,
    );
    return {
      byLeague: { [REPLAY_LEAGUE]: sampleMatches() },
      source: "sample",
      reason: unauth ? "signed_out" : "unavailable",
    };
  }
  return { byLeague, source: "api", reason: null };
}

/**
 * Fixtures for a day across every league, refreshed every 30 s. Refreshes only ask the
 * leagues that had matches. When the API is missing it falls back to sample matches built
 * from the scripted scenarios, so the page is never empty.
 */
export function useFixtures(dayOffset: number): FixturesState {
  const date = dateKey(dayOffset);
  // Leagues with matches that day, once known: refreshes skip the empty ones.
  const active = useRef<{ date: string; slugs: string[] } | null>(null);

  const { data, isLoading } = useSWR(
    ["fixtures", date],
    async () => {
      const known = active.current?.date === date ? active.current.slugs : null;
      const day = await loadDay(date, known?.length ? known : ALL_SLUGS);
      // A refresh that got no answer keeps showing the last good list.
      if (known && day.source === "sample") throw new Error("feed unavailable");
      if (day.source === "api") {
        active.current = { date, slugs: Object.keys(day.byLeague) };
        rememberTeams(
          Object.values(day.byLeague).flatMap((list) =>
            list.flatMap((m) => [m.home, m.away]),
          ),
        );
      }
      return day;
    },
    { refreshInterval: POLL_MS, keepPreviousData: false },
  );

  return {
    byLeague: data?.byLeague ?? {},
    loading: isLoading,
    source: data?.source ?? "api",
    reason: data?.reason ?? null,
  };
}

/** Flatten for search. */
export function useAllMatches(byLeague: Record<string, MatchListItem[]>) {
  return useMemo(() => Object.values(byLeague).flat(), [byLeague]);
}
