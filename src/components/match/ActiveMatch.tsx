"use client";

import { RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveMatch, getTeamColors } from "@/actions/football";
import {
  flashGoalAction,
  resetLight,
  updateLightGradient,
} from "@/actions/hue";
import { Button } from "@/components/ui/button";
import { ALL_STATS, type StatKey } from "@/lib/football";
import { clubColorToHex } from "@/lib/teamColors";
import type { KicklightConfig, LiveMatch, Match } from "@/types";
import { FeaturedStat } from "./FeaturedStat";
import { ScoreDisplay } from "./ScoreDisplay";
import { StatBar } from "./StatBar";

// Statuses where we should stop polling entirely
const TERMINAL_STATUSES = new Set([
  "SUSPENDED",
  "POSTPONED",
  "CANCELLED",
  "AWARDED",
]);

export function ActiveMatch({
  match,
  config,
  onStop,
  onNextPollTime,
  onRateLimitWarning,
  onBridgeStatusChange,
  onReconfigure,
}: {
  match: Match;
  config: KicklightConfig;
  onStop: () => void;
  onNextPollTime: (time: Date) => void;
  onRateLimitWarning: (warning: boolean) => void;
  onBridgeStatusChange: (connected: boolean) => void;
  onReconfigure: () => void;
}) {
  const [liveData, setLiveData] = useState<LiveMatch | null>(null);
  const [teamColors, setTeamColors] = useState({ home: "", away: "" });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hueError, setHueError] = useState<string | null>(null);
  const [activeStatKey, setActiveStatKey] = useState<StatKey>("goals");
  const activeStatKeyRef = useRef<StatKey>("goals");
  const previousScoreRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppedRef = useRef(false);
  const rateLimitMultiplier = useRef(1);

  activeStatKeyRef.current = activeStatKey;

  const homeHex = clubColorToHex(teamColors.home);
  const awayHex = clubColorToHex(teamColors.away);

  const getEffectiveInterval = useCallback(
    (status?: string) => {
      const base = config.pollIntervalSeconds * 1000;
      if (status === "SCHEDULED" || status === "TIMED") {
        return 5 * 60 * 1000; // 5 minutes for pre-match
      }
      if (status === "PAUSED") {
        return 10 * 60 * 1000; // 10 minutes during half time
      }
      return base * rateLimitMultiplier.current;
    },
    [config.pollIntervalSeconds],
  );

  const startPollingRef = useRef<() => void>(() => {});

  const handleStop = useCallback(async () => {
    isStoppedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    await resetLight();
    onStop();
  }, [onStop]);

  const tick = useCallback(async () => {
    if (isStoppedRef.current) return;

    const result = await getLiveMatch(match.id);

    if (result.error) {
      setError(result.error);
      // Rate limited — pause and resume
      if (result.rateLimit && result.rateLimit.requestsAvailable === 0) {
        onRateLimitWarning(true);
        const resetMs = result.rateLimit.counterReset * 1000;
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => {
          if (!isStoppedRef.current) {
            onRateLimitWarning(false);
            rateLimitMultiplier.current = 1;
            startPollingRef.current();
          }
        }, resetMs);
        return;
      }
      return;
    }

    setError(null);

    if (result.rateLimit) {
      if (result.rateLimit.requestsAvailable <= 3) {
        rateLimitMultiplier.current = 2;
        onRateLimitWarning(true);
      } else {
        rateLimitMultiplier.current = 1;
        onRateLimitWarning(false);
      }
    }

    const data = result.match;
    if (!data) return;

    setLiveData(data);
    setLastUpdated(new Date());

    // Goal detection
    const currentScore = `${data.score.fullTime.home ?? 0}-${data.score.fullTime.away ?? 0}`;
    if (previousScoreRef.current && previousScoreRef.current !== currentScore) {
      const prevParts = previousScoreRef.current.split("-").map(Number);
      const currHome = data.score.fullTime.home ?? 0;
      const scoringTeamHex = currHome > prevParts[0] ? homeHex : awayHex;
      await flashGoalAction(scoringTeamHex);
    }
    previousScoreRef.current = currentScore;

    // Handle terminal statuses
    if (TERMINAL_STATUSES.has(data.status)) {
      isStoppedRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      await resetLight();
      return;
    }

    // Handle FINISHED
    if (data.status === "FINISHED") {
      isStoppedRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Hold lights for 30 seconds then reset
      setTimeout(async () => {
        await resetLight();
      }, 30_000);
      return;
    }

    // Update light gradient for active match statuses — driven by selected stat
    if (data.status === "IN_PLAY" || data.status === "EXTRA_TIME") {
      const activeStat = ALL_STATS.find(
        (s) => s.key === activeStatKeyRef.current,
      )!;
      const { homePct } = activeStat.calculate(data);
      const lightResult = await updateLightGradient(homeHex, awayHex, homePct);
      if (lightResult.error) {
        onBridgeStatusChange(false);
        setHueError(lightResult.error);
      } else {
        onBridgeStatusChange(true);
        setHueError(null);
      }
    }

    // Penalty shootout — alternate pulse
    if (data.status === "PENALTY_SHOOTOUT") {
      // Simple toggle: even seconds = home, odd = away
      const isHomePhase = Math.floor(Date.now() / 2000) % 2 === 0;
      const hex = isHomePhase ? homeHex : awayHex;
      await updateLightGradient(hex, hex, 50);
    }

    // Schedule next poll time
    const nextInterval = getEffectiveInterval(data.status);
    onNextPollTime(new Date(Date.now() + nextInterval));
  }, [
    match.id,
    homeHex,
    awayHex,
    getEffectiveInterval,
    onNextPollTime,
    onRateLimitWarning,
    onBridgeStatusChange,
  ]);

  // We use a ref to always call the latest tick in the interval
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const intervalMs = getEffectiveInterval(liveData?.status);
    intervalRef.current = setInterval(() => {
      tickRef.current();
    }, intervalMs);
    onNextPollTime(new Date(Date.now() + intervalMs));
  }, [getEffectiveInterval, liveData?.status, onNextPollTime]);
  startPollingRef.current = startPolling;

  // Fetch team colors from /teams/{id} (clubColors not in match list response)
  useEffect(() => {
    getTeamColors(match.homeTeam.id, match.awayTeam.id).then(setTeamColors);
  }, [match.homeTeam.id, match.awayTeam.id]);

  // Initial fetch + start polling
  useEffect(() => {
    isStoppedRef.current = false;
    tickRef.current();
    const intervalMs = getEffectiveInterval();
    intervalRef.current = setInterval(() => {
      tickRef.current();
    }, intervalMs);
    onNextPollTime(new Date(Date.now() + intervalMs));

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [getEffectiveInterval, onNextPollTime]);

  // Restart polling when interval changes (e.g. rate limit multiplier or status change)
  useEffect(() => {
    if (isStoppedRef.current || !liveData) return;
    startPolling();
  }, [liveData?.status, startPolling, liveData]);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-8 py-8"
      style={
        {
          "--team-home": homeHex,
          "--team-away": awayHex,
        } as React.CSSProperties
      }
    >
      {liveData ? (
        <ScoreDisplay match={liveData} homeHex={homeHex} awayHex={awayHex} />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="size-5 animate-spin" />
          <span className="text-sm">Loading match data…</span>
        </div>
      )}

      {/* Featured active stat — donut ring */}
      {(() => {
        const activeStat = ALL_STATS.find((s) => s.key === activeStatKey)!;
        const { homePct, isFallback } = liveData
          ? activeStat.calculate(liveData)
          : { homePct: 50, isFallback: true };
        const values = liveData
          ? activeStat.getValues(liveData)
          : { home: null, away: null };
        return (
          <FeaturedStat
            label={activeStat.label}
            homePct={homePct}
            homeValue={values.home ?? undefined}
            awayValue={values.away ?? undefined}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            homeHex={homeHex}
            awayHex={awayHex}
            footerText={
              isFallback ? activeStat.fallbackText : activeStat.activeText
            }
          />
        );
      })()}

      {/* Compact stat rows */}
      <div className="flex w-full flex-col">
        {ALL_STATS.map((stat) => {
          const { homePct, isFallback } = liveData
            ? stat.calculate(liveData)
            : { homePct: 50, isFallback: true };
          const values = liveData
            ? stat.getValues(liveData)
            : { home: null, away: null };
          return (
            <StatBar
              key={stat.key}
              label={stat.label}
              homePct={homePct}
              awayPct={100 - homePct}
              homeValue={values.home ?? undefined}
              awayValue={values.away ?? undefined}
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
              homeHex={homeHex}
              awayHex={awayHex}
              isActive={activeStatKey === stat.key}
              onActivate={() => setActiveStatKey(stat.key)}
              footerText={isFallback ? stat.fallbackText : stat.activeText}
              showTeamLabels={stat.showTeamLabels}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => tickRef.current()}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
        <Button variant="destructive" size="sm" onClick={handleStop}>
          <Square className="size-3.5" />
          Stop
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {hueError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-center">
          <p className="text-xs text-destructive">
            Light strip error: {hueError}
          </p>
          <Button variant="outline" size="sm" onClick={onReconfigure}>
            Reconfigure bridge
          </Button>
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
