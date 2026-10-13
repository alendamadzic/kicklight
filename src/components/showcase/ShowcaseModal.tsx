"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  flashGoalAction,
  resetLight,
  updateLightGradient,
} from "@/actions/hue";
import { FeaturedStat } from "@/components/match/FeaturedStat";
import { ScoreDisplay } from "@/components/match/ScoreDisplay";
import { StatBar } from "@/components/match/StatBar";
import { Slider } from "@/components/ui/slider";
import { ALL_STATS, type StatKey } from "@/lib/football";
import { cn } from "@/lib/utils";
import type { LiveMatch, MatchStatus } from "@/types";
import {
  SHOWCASE_MATCHUPS,
  SHOWCASE_SCENARIOS,
  type ShowcaseMatchup,
  type ShowcaseScenario,
  type ShowcaseStats,
} from "./data";

function buildLiveMatchSnapshot(
  matchup: ShowcaseMatchup,
  status: MatchStatus,
  homeGoals: number,
  awayGoals: number,
  homePossession: number,
  minute: number | null,
  stats: ShowcaseStats | null,
): LiveMatch {
  return {
    id: 0,
    homeTeam: matchup.homeTeam,
    awayTeam: matchup.awayTeam,
    competition: { name: matchup.competition, emblem: "" },
    status,
    score: {
      fullTime: { home: homeGoals, away: awayGoals },
      halfTime: { home: null, away: null },
    },
    utcDate: new Date().toISOString(),
    minute,
    possession: { home: homePossession, away: 100 - homePossession },
    shots: stats?.shots ?? null,
    shotsOnGoal: stats?.shotsOnGoal ?? null,
    shotsOffGoal: stats?.shotsOffGoal ?? null,
    cornerKicks: stats?.cornerKicks ?? null,
    freeKicks: stats?.freeKicks ?? null,
    goalKicks: stats?.goalKicks ?? null,
    throwIns: stats?.throwIns ?? null,
    offsides: stats?.offsides ?? null,
    fouls: stats?.fouls ?? null,
    saves: stats?.saves ?? null,
    yellowCards: stats?.yellowCards ?? null,
    yellowRedCards: stats?.yellowRedCards ?? null,
    redCards: stats?.redCards ?? null,
  };
}

export function ShowcaseModal({ onClose }: { onClose: () => void }) {
  const [matchup, setMatchup] = useState<ShowcaseMatchup | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [status, setStatus] = useState<MatchStatus>("IN_PLAY");
  const [minute, setMinute] = useState<number | null>(null);
  const [homePossession, setHomePossession] = useState(50);
  const [scenarioStats, setScenarioStats] = useState<ShowcaseStats | null>(
    null,
  );
  const [activeStatKey, setActiveStatKey] = useState<StatKey>("goals");
  const [lightError, setLightError] = useState<string | null>(null);

  const penaltyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const matchupRef = useRef<ShowcaseMatchup | null>(null);
  const activeStatKeyRef = useRef<StatKey>("goals");
  matchupRef.current = matchup;
  activeStatKeyRef.current = activeStatKey;

  const stopPenalty = useCallback(() => {
    if (penaltyIntervalRef.current) {
      clearInterval(penaltyIntervalRef.current);
      penaltyIntervalRef.current = null;
    }
  }, []);

  const startPenalty = useCallback(() => {
    stopPenalty();
    penaltyIntervalRef.current = setInterval(async () => {
      const m = matchupRef.current;
      if (!m) return;
      const isHomePhase = Math.floor(Date.now() / 2000) % 2 === 0;
      const hex = isHomePhase ? m.homeHex : m.awayHex;
      await updateLightGradient(hex, hex, 50);
    }, 2000);
  }, [stopPenalty]);

  useEffect(() => {
    return () => {
      stopPenalty();
      resetLight();
    };
  }, [stopPenalty]);

  const pushLights = useCallback(
    async (m: ShowcaseMatchup, st: MatchStatus, lightPct: number) => {
      if (st === "PENALTY_SHOOTOUT") {
        startPenalty();
        return;
      }
      stopPenalty();
      if (st === "FINISHED") {
        setTimeout(() => resetLight(), 5000);
        return;
      }
      const result = await updateLightGradient(m.homeHex, m.awayHex, lightPct);
      if (result.error) setLightError(result.error);
      else setLightError(null);
    },
    [startPenalty, stopPenalty],
  );

  const handleSelectMatchup = useCallback(
    async (m: ShowcaseMatchup) => {
      setMatchup(m);
      if (activeScenarioId) {
        const activeStat = ALL_STATS.find(
          (s) => s.key === activeStatKeyRef.current,
        )!;
        const snap = buildLiveMatchSnapshot(
          m,
          status,
          homeGoals,
          awayGoals,
          homePossession,
          minute,
          scenarioStats,
        );
        const { homePct } = activeStat.calculate(snap);
        await pushLights(m, status, homePct);
      }
    },
    [
      activeScenarioId,
      status,
      homePossession,
      homeGoals,
      awayGoals,
      minute,
      scenarioStats,
      pushLights,
    ],
  );

  const handleSelectScenario = useCallback(
    async (s: ShowcaseScenario) => {
      setActiveScenarioId(s.id);
      setHomeGoals(s.homeGoals);
      setAwayGoals(s.awayGoals);
      setStatus(s.status);
      setMinute(s.minute);
      setHomePossession(s.homePossession);
      setScenarioStats(s.stats);
      if (matchup) {
        const activeStat = ALL_STATS.find(
          (st) => st.key === activeStatKeyRef.current,
        )!;
        const snap = buildLiveMatchSnapshot(
          matchup,
          s.status,
          s.homeGoals,
          s.awayGoals,
          s.homePossession,
          s.minute,
          s.stats,
        );
        const { homePct } = activeStat.calculate(snap);
        await pushLights(matchup, s.status, homePct);
      }
    },
    [matchup, pushLights],
  );

  const handleGoal = useCallback(
    async (side: "home" | "away") => {
      if (!matchup || !activeScenarioId) return;
      const newHome = homeGoals + (side === "home" ? 1 : 0);
      const newAway = awayGoals + (side === "away" ? 1 : 0);
      setHomeGoals(newHome);
      setAwayGoals(newAway);
      setMinute((m) => (m !== null ? Math.min(m + 7, 90) : 55));
      const scoringHex = side === "home" ? matchup.homeHex : matchup.awayHex;
      await flashGoalAction(scoringHex);
      const activeStat = ALL_STATS.find(
        (st) => st.key === activeStatKeyRef.current,
      )!;
      const snap = buildLiveMatchSnapshot(
        matchup,
        status,
        newHome,
        newAway,
        homePossession,
        minute,
        scenarioStats,
      );
      const { homePct } = activeStat.calculate(snap);
      await pushLights(matchup, status, homePct);
    },
    [
      matchup,
      activeScenarioId,
      homeGoals,
      awayGoals,
      status,
      homePossession,
      minute,
      scenarioStats,
      pushLights,
    ],
  );

  const handlePossessionChange = useCallback(
    async (values: number | readonly number[]) => {
      const newPossession = Array.isArray(values)
        ? (values as number[])[0]
        : (values as number);
      setHomePossession(newPossession);
      if (
        matchup &&
        activeScenarioId &&
        activeStatKeyRef.current === "possession"
      ) {
        await pushLights(matchup, status, newPossession);
      }
    },
    [matchup, activeScenarioId, status, pushLights],
  );

  const handleActivateStat = useCallback(
    async (key: StatKey) => {
      setActiveStatKey(key);
      activeStatKeyRef.current = key;
      if (!matchup || !activeScenarioId) return;
      const activeStat = ALL_STATS.find((s) => s.key === key)!;
      const snap = buildLiveMatchSnapshot(
        matchup,
        status,
        homeGoals,
        awayGoals,
        homePossession,
        minute,
        scenarioStats,
      );
      const { homePct } = activeStat.calculate(snap);
      await pushLights(matchup, status, homePct);
    },
    [
      matchup,
      activeScenarioId,
      homeGoals,
      awayGoals,
      homePossession,
      status,
      minute,
      scenarioStats,
      pushLights,
    ],
  );

  const isActive = !!matchup && !!activeScenarioId;
  const canAddGoals =
    isActive && (status === "IN_PLAY" || status === "EXTRA_TIME");

  const fakeMatch =
    isActive && matchup
      ? buildLiveMatchSnapshot(
          matchup,
          status,
          homeGoals,
          awayGoals,
          homePossession,
          minute,
          scenarioStats,
        )
      : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop — click-outside-to-close is a standard pattern
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Showcase
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          className="flex flex-col gap-5 overflow-y-auto p-5"
          style={{ maxHeight: "calc(90vh - 72px)" }}
        >
          {/* Matchup selector */}
          <div className="flex flex-col gap-2.5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Match
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SHOWCASE_MATCHUPS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMatchup(m)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    matchup?.id === m.id
                      ? "border-foreground/30 bg-foreground/10"
                      : "border-border hover:border-foreground/20 hover:bg-muted/50",
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: m.homeHex }}
                  />
                  <span>{m.homeTeam.name}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span>{m.awayTeam.name}</span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: m.awayHex }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Scenario selector */}
          {matchup && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Scenario
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SHOWCASE_SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectScenario(s)}
                    className={cn(
                      "flex shrink-0 flex-col rounded-xl border px-3 py-2 text-left transition-colors",
                      activeScenarioId === s.id
                        ? "border-foreground/30 bg-foreground/10"
                        : "border-border hover:border-foreground/20 hover:bg-muted/50",
                    )}
                  >
                    <span className="text-xs font-semibold">{s.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active view */}
          {isActive && fakeMatch && matchup && (
            <>
              <div className="border-t" />
              <div
                className="flex flex-col gap-6"
                style={
                  {
                    "--team-home": matchup.homeHex,
                    "--team-away": matchup.awayHex,
                  } as React.CSSProperties
                }
              >
                <ScoreDisplay
                  match={fakeMatch}
                  homeHex={matchup.homeHex}
                  awayHex={matchup.awayHex}
                />

                {/* Featured active stat */}
                {(() => {
                  const activeStat = ALL_STATS.find(
                    (s) => s.key === activeStatKey,
                  )!;
                  const { homePct, isFallback } =
                    activeStat.calculate(fakeMatch);
                  const values = activeStat.getValues(fakeMatch);
                  return (
                    <FeaturedStat
                      label={activeStat.label}
                      homePct={homePct}
                      homeValue={values.home ?? undefined}
                      awayValue={values.away ?? undefined}
                      homeTeam={matchup.homeTeam}
                      awayTeam={matchup.awayTeam}
                      homeHex={matchup.homeHex}
                      awayHex={matchup.awayHex}
                      footerText={
                        activeStat.key === "possession" &&
                        activeStatKey === "possession"
                          ? "Drag to adjust"
                          : isFallback
                            ? activeStat.fallbackText
                            : activeStat.activeText
                      }
                    />
                  );
                })()}

                {/* Compact stat rows */}
                <div className="flex flex-col">
                  {ALL_STATS.map((stat) => {
                    const { homePct, isFallback } = stat.calculate(fakeMatch);
                    const values = stat.getValues(fakeMatch);
                    return (
                      <div key={stat.key}>
                        <StatBar
                          label={stat.label}
                          homePct={homePct}
                          awayPct={100 - homePct}
                          homeValue={values.home ?? undefined}
                          awayValue={values.away ?? undefined}
                          homeTeam={matchup.homeTeam}
                          awayTeam={matchup.awayTeam}
                          homeHex={matchup.homeHex}
                          awayHex={matchup.awayHex}
                          isActive={activeStatKey === stat.key}
                          onActivate={() => handleActivateStat(stat.key)}
                          footerText={
                            stat.key === "possession" &&
                            activeStatKey === "possession"
                              ? "Drag to adjust"
                              : isFallback
                                ? stat.fallbackText
                                : stat.activeText
                          }
                          showTeamLabels={stat.showTeamLabels}
                        />
                        {stat.key === "possession" &&
                          activeStatKey === "possession" && (
                            <div className="px-3 pb-2">
                              <Slider
                                value={[homePossession]}
                                min={1}
                                max={99}
                                onValueChange={handlePossessionChange}
                                aria-label="Home possession percentage"
                              />
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>

                {canAddGoals && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleGoal("home")}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-opacity hover:opacity-80"
                      style={{
                        borderColor: `${matchup.homeHex}70`,
                        backgroundColor: `${matchup.homeHex}18`,
                        color: matchup.homeHex,
                      }}
                    >
                      <span>+</span>
                      <span className="truncate">{matchup.homeTeam.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGoal("away")}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-opacity hover:opacity-80"
                      style={{
                        borderColor: `${matchup.awayHex}70`,
                        backgroundColor: `${matchup.awayHex}18`,
                        color: matchup.awayHex,
                      }}
                    >
                      <span>+</span>
                      <span className="truncate">{matchup.awayTeam.name}</span>
                    </button>
                  </div>
                )}

                {lightError && (
                  <p className="text-center text-xs text-muted-foreground">
                    Light unavailable — showing preview only
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
