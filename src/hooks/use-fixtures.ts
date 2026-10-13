"use client";

import { useEffect, useMemo, useState } from "react";
import { LEAGUES } from "@/engine/feed/leagues";
import { ApiRequestError, api } from "@/lib/api";
import type { MatchListItem } from "@/lib/api-types";
import { fixtureMatches, REPLAY_LEAGUE } from "@/lib/fixtures";
import { dateKey } from "@/lib/format";
import { rememberTeams } from "./use-preferences";

export type FixturesSource = "api" | "sample";
export type SampleReason = "signed_out" | "unavailable" | null;

export interface FixturesState {
  /** Matches by league slug, in LEAGUES order. */
  byLeague: Record<string, MatchListItem[]>;
  loading: boolean;
  source: FixturesSource;
  reason: SampleReason;
}

const CHUNK = 4;
const POLL_MS = 30_000;

/**
 * Fixtures for a day across every league. Fetches in small batches and fills in as
 * they land. When the API is missing or the viewer is signed out it falls back to
 * sample matches built from the scripted scenarios, so the page is never empty.
 */
export function useFixtures(dayOffset: number): FixturesState {
  const [state, setState] = useState<FixturesState>({
    byLeague: {},
    loading: true,
    source: "api",
    reason: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const date = dateKey(dayOffset);

    const showSample = (reason: SampleReason) => {
      setState({
        byLeague: { [REPLAY_LEAGUE]: fixtureMatches() },
        loading: false,
        source: "sample",
        reason,
      });
      timer = setTimeout(() => showSample(reason), POLL_MS);
    };

    const run = async (slugs: string[], first: boolean) => {
      const next: Record<string, MatchListItem[]> = {};
      const failures: ApiRequestError[] = [];
      let ok = 0;
      for (let i = 0; i < slugs.length; i += CHUNK) {
        const chunk = slugs.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          chunk.map((s) => api.matches(s, date)),
        );
        if (cancelled) return;
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            ok++;
            if (r.value.matches.length) next[chunk[idx]] = r.value.matches;
          } else if (r.reason instanceof ApiRequestError)
            failures.push(r.reason);
        });
        // The very first batch decides whether there is a backend at all.
        if (first && i === 0 && ok === 0) {
          const unauth = failures.some((f) => f.unauthenticated);
          showSample(unauth ? "signed_out" : "unavailable");
          return;
        }
        if (first) {
          setState({
            byLeague: { ...next },
            loading: i + CHUNK < slugs.length,
            source: "api",
            reason: null,
          });
        }
      }
      if (cancelled) return;
      if (!first && ok === 0) {
        timer = setTimeout(() => void run(slugs, false), POLL_MS);
        return;
      }
      for (const list of Object.values(next)) {
        rememberTeams(list.flatMap((m) => [m.home, m.away]));
      }
      setState({ byLeague: next, loading: false, source: "api", reason: null });
      const activeSlugs = Object.keys(next);
      timer = setTimeout(
        () => void run(activeSlugs.length ? activeSlugs : slugs, false),
        POLL_MS,
      );
    };

    setState((s) => ({ ...s, loading: true }));
    void run(
      LEAGUES.map((l) => l.slug),
      true,
    );
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dayOffset]);

  return state;
}

/** Flatten for search. */
export function useAllMatches(byLeague: Record<string, MatchListItem[]>) {
  return useMemo(() => Object.values(byLeague).flat(), [byLeague]);
}
