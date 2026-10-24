"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClockReading, MatchPhase } from "@/engine/model";
import {
  type ClockTrack,
  clockAt,
  formatClock,
  markAt,
  trackClock,
} from "@/lib/match-clock";
import { cn } from "@/lib/utils";

const MAX_S = 120;
const STEPS = [-30, -5, -1, 1, 5, 30] as const;
/** Taps land together, so a run of nudges is one write. */
const COMMIT_MS = 600;

const STILL_LABEL: Partial<Record<MatchPhase, string>> = {
  scheduled: "KO",
  half_time: "HT",
  full_time: "FT",
  shootout: "PENS",
  suspended: "—",
};

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * TV delay, set by eye: the match clock as your TV should be showing it, nudged until
 * it matches. Running the clock on means more delay is taken off it, and the other way
 * round, so the lights wait exactly as long as your stream is behind.
 */
export function TvClock({
  clock,
  phase,
  delayMs,
  onCommit,
}: {
  clock: ClockReading | undefined;
  phase: MatchPhase;
  delayMs: number;
  /** Fired once a run of nudges settles. */
  onCommit: (ms: number) => void;
}) {
  const now = useNow(250);

  // Run on from the latest reading, without stepping back for a stale one.
  const [track, setTrack] = useState<ClockTrack | null>(null);
  const [seen, setSeen] = useState<ClockReading | undefined>(undefined);
  if (clock !== seen) {
    setSeen(clock);
    if (clock) setTrack((t) => trackClock(t, clock, phase));
  }

  // Nudges not yet written. The ref holds it too, so taps quicker than a render add up.
  const [pending, setPending] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const delayS = pending ?? Math.round(delayMs / 1000);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const nudge = (clockDelta: number) => {
    const base = pendingRef.current ?? Math.round(delayMs / 1000);
    const next = Math.max(0, Math.min(MAX_S, base - clockDelta));
    pendingRef.current = next;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      pendingRef.current = null;
      onCommit(next * 1000);
      setPending(null);
    }, COMMIT_MS);
  };

  const mark = track ? markAt(track, now - delayS * 1000) : null;
  const ticking = !!mark?.reading.running;
  const shown = mark
    ? ticking
      ? formatClock(clockAt(mark.reading, now - delayS * 1000))
      : (STILL_LABEL[mark.phase] ?? formatClock(mark.reading.seconds))
    : (STILL_LABEL[phase] ?? "—");

  return (
    <div className="flex flex-col gap-3">
      <output
        aria-label="Match clock as your TV shows it"
        className={cn(
          "kl-display self-center rounded-lg bg-amber px-4 py-2 text-5xl leading-none tabular-nums text-[#1a1200]",
          !ticking && "opacity-80",
        )}
      >
        {shown}
      </output>

      <div className="grid grid-cols-6 gap-1.5">
        {STEPS.map((d) => {
          const blocked = d > 0 ? delayS <= 0 : delayS >= MAX_S;
          return (
            <Button
              key={d}
              variant="secondary"
              aria-label={`Clock ${d > 0 ? "forward" : "back"} ${Math.abs(d)} second${Math.abs(d) === 1 ? "" : "s"}`}
              disabled={blocked}
              onClick={() => nudge(d)}
              className="h-11 min-w-0 px-0 text-sm font-semibold tabular-nums"
            >
              {d > 0 ? `+${d}` : `−${-d}`}
            </Button>
          );
        })}
      </div>

      <p className="text-center text-sm font-medium tabular-nums">
        Your lights wait {delayS} s
      </p>

      <p className="text-xs text-muted-foreground">
        {ticking
          ? "Nudge the clock until it reads the same as the one on your TV. Your lights wait the difference."
          : "The clock starts with play. You can nudge the delay now and fine-tune once the match is running."}
      </p>
    </div>
  );
}
