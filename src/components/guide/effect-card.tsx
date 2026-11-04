"use client";

import { PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EFFECTS } from "@/engine/effects";
import type { GuideColour, GuideEntry } from "@/lib/effect-copy";
import { EFFECT_TINT } from "@/lib/ticker";
import { cn } from "@/lib/utils";

const COLOUR_LABEL: Record<GuideColour, string> = {
  team: "Team colour",
  end: "From their end",
  winner: "Winner's colour",
  match: "Both teams",
};

const seconds = (ms: number) =>
  `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;

/**
 * One row of the lights guide: what sets an effect off, what the strip does, and a
 * button that plays it on the preview strip.
 */
export function EffectCard({
  entry,
  playing,
  playingVariant,
  onPlay,
  onStop,
  teamColor,
}: {
  entry: GuideEntry;
  /** This row's effect is on the strip right now. */
  playing: boolean;
  /** Which of this row's buttons started it: "main" or "draw". */
  playingVariant: string | null;
  onPlay: (variant: "main" | "draw") => void;
  onStop: () => void;
  /** The kit colour this row would play in, for the swatch. */
  teamColor: string;
}) {
  const fx = entry.plays ? EFFECTS[entry.plays.effect] : undefined;
  const tint = entry.plays
    ? (EFFECT_TINT[entry.event] ?? EFFECT_TINT[entry.plays.effect] ?? "#8f9bb2")
    : "var(--muted-foreground)";
  const swatch =
    entry.colour === "match" || entry.colour === "end" ? tint : teamColor;

  return (
    <li
      className={cn(
        "kl-panel relative flex gap-3 overflow-hidden p-3.5 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none",
        !fx && "bg-transparent",
      )}
      style={
        playing
          ? { borderColor: `${tint}99`, boxShadow: `0 0 24px -8px ${tint}` }
          : undefined
      }
    >
      <span
        aria-hidden
        className="mt-1 size-3 shrink-0 rounded-[3px]"
        style={{
          background: fx ? swatch : "transparent",
          border: fx ? undefined : "1.5px solid var(--muted-foreground)",
          boxShadow: fx ? `0 0 10px ${swatch}88` : undefined,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-[0.9375rem] font-semibold leading-tight">
            {entry.label}
          </h3>
          {fx ? (
            <span className="kl-eyebrow">
              {COLOUR_LABEL[entry.colour]} · {seconds(fx.durationMs)}
            </span>
          ) : (
            <span className="kl-eyebrow">No effect</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{entry.when}</p>
        <p className="text-sm">{entry.does}</p>
        {fx && entry.colour === "winner" ? (
          <div className="mt-2 flex gap-2">
            <PlayButton
              label="Win"
              aria={`Play ${entry.label}, selected team wins`}
              on={playing && playingVariant === "main"}
              onPlay={() => onPlay("main")}
              onStop={onStop}
            />
            <PlayButton
              label="Draw"
              aria={`Play ${entry.label}, a draw`}
              on={playing && playingVariant === "draw"}
              onPlay={() => onPlay("draw")}
              onStop={onStop}
            />
          </div>
        ) : null}
      </div>
      {fx && entry.colour !== "winner" ? (
        <PlayButton
          aria={`Play ${entry.label}`}
          on={playing}
          onPlay={() => onPlay("main")}
          onStop={onStop}
          className="self-center"
        />
      ) : null}
      {playing && fx ? (
        <span
          aria-hidden
          className="kl-guide-progress absolute inset-x-0 bottom-0 h-0.5 origin-left"
          style={{
            background: tint,
            animationDuration: `${fx.durationMs}ms`,
          }}
        />
      ) : null}
    </li>
  );
}

function PlayButton({
  label,
  aria,
  on,
  onPlay,
  onStop,
  className,
}: {
  label?: string;
  aria: string;
  on: boolean;
  onPlay: () => void;
  onStop: () => void;
  className?: string;
}) {
  return (
    <Button
      variant={on ? "default" : "secondary"}
      size={label ? "default" : "icon-lg"}
      aria-label={on ? "Stop" : aria}
      aria-pressed={on}
      onClick={on ? onStop : onPlay}
      className={cn(
        "kl-press shrink-0 rounded-xl",
        label ? "h-10 px-4" : "size-11",
        className,
      )}
    >
      {on ? <SquareIcon /> : <PlayIcon />}
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
