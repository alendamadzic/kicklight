"use client";

import { EFFECTS, type EffectKey, PAD_ORDER } from "@/engine/effects";
import type { Side } from "@/engine/model";
import { readableOn } from "@/lib/format";
import { EFFECT_TINT } from "@/lib/ticker";
import { cn } from "@/lib/utils";

/** Match-level effects belong to nobody, so the home/away switch doesn't apply. */
const NEUTRAL: ReadonlySet<EffectKey> = new Set<EffectKey>([
  "kickoff",
  "half_time",
  "full_time",
  "var",
  "nerves",
]);

/**
 * The event pad: fire any effect on the strip as if it had just happened.
 * Pick the side, then hit a pad.
 */
export function EventPad({
  side,
  onSideChange,
  onFire,
  home,
  away,
}: {
  side: Side;
  onSideChange: (side: Side) => void;
  onFire: (effect: EffectKey, side: Side | null) => void;
  home: { short: string; color: string };
  away: { short: string; color: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Which team"
        className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1"
      >
        {(
          [
            ["home", home],
            ["away", away],
          ] as const
        ).map(([key, t]) => {
          const on = side === key;
          return (
            // biome-ignore lint/a11y/useSemanticElements: styled radio buttons
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSideChange(key)}
              className={cn(
                "kl-display kl-press h-11 rounded-md text-lg leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !on && "text-muted-foreground hover:text-foreground",
              )}
              style={
                on
                  ? { background: t.color, color: readableOn(t.color) }
                  : undefined
              }
            >
              {t.short}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PAD_ORDER.map((key) => {
          const fx = EFFECTS[key];
          if (!fx) return null;
          const tint = EFFECT_TINT[key] ?? "#8f9bb2";
          const neutral = NEUTRAL.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFire(key, neutral ? null : side)}
              className="kl-press group relative flex min-h-14 flex-col items-start justify-end gap-1 overflow-hidden rounded-lg border border-border bg-card px-2.5 py-2 text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: tint }}
              />
              <span className="kl-display text-[0.9375rem] leading-[1.05]">
                {fx.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
