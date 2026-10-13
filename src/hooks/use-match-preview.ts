"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MatchResponse } from "@/lib/api-types";
import { fixtureMatch, REPLAY_LEAGUE } from "@/lib/fixtures";

export interface MatchPreviewState {
  data: MatchResponse | null;
  loading: boolean;
  /** "sample" when it came from the scripted fixtures rather than the feed. */
  source: "api" | "sample" | null;
  retry: () => void;
}

const POLL_MS = 20_000;

/** GET /api/matches/[league]/[id], polled, with a scripted-fixture fallback. */
export function useMatchPreview(league: string, id: string): MatchPreviewState {
  const [data, setData] = useState<MatchResponse | null>(null);
  const [source, setSource] = useState<"api" | "sample" | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // `nonce` re-runs the effect for the retry button.
    void nonce;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        if (league === REPLAY_LEAGUE) throw new Error("scripted");
        const res = await api.match(league, id);
        if (cancelled) return;
        setData(res);
        setSource("api");
      } catch {
        if (cancelled) return;
        const fx = fixtureMatch(id);
        if (fx) {
          setData(fx);
          setSource("sample");
        } else {
          setData((d) => d);
        }
      }
      setLoading(false);
      timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [league, id, nonce]);

  const retry = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { data, loading, source, retry };
}
