"use client";

import { useEffect, useState } from "react";

const R = 44;
const C = 2 * Math.PI * R;

/** A ring that drains over `seconds`. Calls `onDone` when it hits zero. */
export function CountdownRing({
  seconds,
  runId,
  onDone,
}: {
  seconds: number;
  /** Change to restart the countdown. */
  runId: number;
  onDone?: () => void;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const started = performance.now();
    setLeft(seconds);
    // runId is read so a new run restarts the clock.
    void runId;
    const t = setInterval(() => {
      const remaining = Math.max(
        0,
        seconds - (performance.now() - started) / 1000,
      );
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        onDone?.();
      }
    }, 100);
    return () => clearInterval(t);
  }, [seconds, runId, onDone]);

  return (
    <div className="relative size-28">
      <svg
        viewBox="0 0 100 100"
        className="size-full -rotate-90"
        role="img"
        aria-label="Time left to press the button"
      >
        <title>Time left to press the button</title>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - left / seconds)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kl-display text-3xl leading-none tabular-nums">
          {Math.ceil(left)}
        </span>
        <span className="kl-eyebrow text-[0.5625rem]">seconds</span>
      </div>
    </div>
  );
}
