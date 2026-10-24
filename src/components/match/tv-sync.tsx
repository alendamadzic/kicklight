"use client";

import { TimerIcon } from "lucide-react";
import { useState } from "react";
import { ResponsiveOverlay } from "@/components/chrome/responsive-overlay";
import type { ClockReading, MatchPhase } from "@/engine/model";
import { cn } from "@/lib/utils";
import { DelaySlider } from "./delay-slider";
import { TvClock } from "./tv-clock";

/**
 * "TV +12s" in the remote's header, always visible: amber at 0 s to hint that it's
 * worth setting. Opens the clock-matching panel (or a plain slider for scripted
 * matches, which run minutes as seconds and have no clock to match).
 */
export function TvSync({
  delayMs,
  clock,
  phase,
  scripted,
  onCommit,
}: {
  delayMs: number;
  clock: ClockReading | undefined;
  phase: MatchPhase;
  scripted: boolean;
  onCommit: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = Math.round(delayMs / 1000);
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={setOpen}
      title="Match your TV"
      description={
        scripted
          ? undefined
          : "Nudge the clock until it reads the same as the one on your TV."
      }
      trigger={
        <button
          type="button"
          aria-label={`TV delay ${s} seconds. Change it`}
          className={cn(
            "kl-press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums",
            s === 0 ? "bg-amber/15 text-amber" : "bg-muted text-foreground",
          )}
        >
          <TimerIcon className="size-3.5" />
          TV {s === 0 ? "+0s" : `+${s}s`}
        </button>
      }
    >
      {scripted ? (
        <DelaySlider valueMs={delayMs} onCommit={onCommit} />
      ) : (
        <TvClock
          clock={clock}
          phase={phase}
          delayMs={delayMs}
          onCommit={onCommit}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Saved as your default for every match.
      </p>
    </ResponsiveOverlay>
  );
}
