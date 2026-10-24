"use client";

import { ArrowDownIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import { HoldButton } from "@/components/chrome/hold-button";
import { ResponsiveOverlay } from "@/components/chrome/responsive-overlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrightnessControl } from "./brightness-control";

const BIG = "h-14 rounded-xl text-base font-semibold";

/**
 * Thumb-reach controls pinned above the tab bar. Before the lights run: Start (which
 * asks first when another match is on your lights). While they run: Pause, brightness,
 * and a hold-to-stop button so one stray tap can't restore the strip mid-match.
 */
export function RemoteControls({
  running,
  paused,
  starting,
  finished,
  otherLive,
  brightness,
  onBrightness,
  onStart,
  onTogglePause,
  onStop,
}: {
  running: boolean;
  paused: boolean;
  starting: boolean;
  /** The match is over: nothing left to start. */
  finished: boolean;
  /** The lights follow a different match: names of both, for the switch question. */
  otherLive: { from: string; to: string; delaySec: number } | null;
  brightness: number;
  onBrightness: (v: number) => void;
  onStart: () => void;
  onTogglePause: () => void;
  onStop: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  const startButton = (
    <Button
      size="lg"
      onClick={otherLive ? undefined : onStart}
      disabled={starting || finished}
      className={cn(BIG, "w-full text-lg", starting && "opacity-80")}
    >
      <PlayIcon data-icon="inline-start" />
      {finished
        ? "Match finished"
        : starting
          ? "Starting…"
          : otherLive
            ? "Switch lights to this match"
            : "Start lights"}
    </Button>
  );

  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.5rem)] z-30 -mx-4 mt-2 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-1 pt-4 sm:bottom-4 sm:mx-0 sm:px-0">
      {running ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
          <Button
            size="lg"
            variant="secondary"
            onClick={onTogglePause}
            className={BIG}
          >
            {paused ? (
              <PlayIcon data-icon="inline-start" />
            ) : (
              <PauseIcon data-icon="inline-start" />
            )}
            {paused ? "Resume" : "Pause"}
          </Button>
          <BrightnessControl value={brightness} onChange={onBrightness} />
          <HoldButton
            onHold={onStop}
            label="Hold to stop and restore your lights"
            className={cn(
              BIG,
              "inline-flex items-center justify-center gap-1.5 bg-destructive/10 px-4 text-destructive transition-colors hover:bg-destructive/20 dark:bg-destructive/20",
            )}
          >
            <SquareIcon className="size-4" />
            <span className="whitespace-nowrap">Hold to stop</span>
          </HoldButton>
        </div>
      ) : otherLive && !finished ? (
        <ResponsiveOverlay
          open={confirm}
          onOpenChange={setConfirm}
          align="center"
          title="Switch your lights?"
          trigger={startButton}
        >
          <div className="flex flex-col items-stretch gap-1 text-sm">
            <span className="rounded-xl bg-muted px-3 py-2.5 text-muted-foreground">
              Now:{" "}
              <span className="font-semibold text-foreground">
                {otherLive.from}
              </span>
            </span>
            <ArrowDownIcon className="size-4 self-center text-amber" />
            <span className="rounded-xl bg-muted px-3 py-2.5 text-muted-foreground">
              Next:{" "}
              <span className="font-semibold text-foreground">
                {otherLive.to}
              </span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Keeps your TV delay (+{otherLive.delaySec}s) and what the lights
            follow. The other match stops.
          </p>
          <Button
            size="lg"
            className={BIG}
            onClick={() => {
              setConfirm(false);
              onStart();
            }}
          >
            Switch to {otherLive.to}
          </Button>
        </ResponsiveOverlay>
      ) : (
        startButton
      )}
    </div>
  );
}
