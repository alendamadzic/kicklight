"use client";

import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import type { Side } from "@/engine/model";
import { type TimelineMarker, timelineEnd } from "@/lib/moments";
import { EFFECT_TINT, effectLabel } from "@/lib/ticker";
import { cn } from "@/lib/utils";

/**
 * The match as a 0-90' bar with a marker for every goal, card, penalty and VAR check,
 * in the colour of what the strip did and ringed in the team's kit. Tap a marker to see
 * it, then replay it on the lights.
 */
export function MomentsTimeline({
  markers,
  minute,
  teams,
  onReplay,
  className,
}: {
  markers: TimelineMarker[];
  /** Where the match is now, for the progress fill. */
  minute: number | null;
  teams: Record<Side, { short: string; color: string }>;
  onReplay?: (m: TimelineMarker) => void;
  className?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const end = timelineEnd(minute);
  const selected =
    markers.find((m) => m.id === picked) ?? markers[markers.length - 1] ?? null;
  const progress = Math.min(1, Math.max(0, (minute ?? 0) / end));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-[0.875rem] h-1 rounded-full bg-muted" />
        <div
          className="absolute left-0 top-[0.875rem] h-1 rounded-full bg-amber/70"
          style={{ width: `${progress * 100}%` }}
        />
        <span
          aria-hidden
          className="absolute top-2 h-4 w-px bg-muted-foreground/40"
          style={{ left: `${(45 / end) * 100}%` }}
        />
        {markers.map((m) => {
          const ring = m.side ? teams[m.side].color : "var(--muted-foreground)";
          const on = selected?.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPicked(m.id)}
              aria-pressed={on}
              aria-label={`${Math.floor(m.minute)}' ${effectLabel(m.effect)}${m.side ? `, ${teams[m.side].short}` : ""}`}
              className="absolute top-0 grid size-8 -translate-x-1/2 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${m.at * 100}%` }}
            >
              <span
                className={cn(
                  "block rounded-[3px] transition-transform",
                  on ? "size-3.5 scale-110" : "size-2.5",
                )}
                style={{
                  background: EFFECT_TINT[m.effect] ?? "#8f9bb2",
                  boxShadow: `0 0 0 2px ${ring}`,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
        <span>0'</span>
        <span>HT</span>
        <span>{end}'</span>
      </div>
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2">
          <span className="w-9 font-mono text-xs tabular-nums text-muted-foreground">
            {Math.floor(selected.minute)}'
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {effectLabel(selected.effect)}
            {selected.side ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {teams[selected.side].short}
              </span>
            ) : null}
          </span>
          {onReplay ? (
            <button
              type="button"
              onClick={() => onReplay(selected)}
              className="kl-press inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber px-3 text-sm font-semibold text-[#1a1200]"
            >
              <RotateCcwIcon className="size-3.5" />
              Replay
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No big moments yet. Goals and cards flash here.
        </p>
      )}
    </div>
  );
}
