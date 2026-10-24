"use client";

import { useEffect, useEffectEvent, useState } from "react";
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

/** Number keys fire pads on a keyboard: 1-9, then 0 for the tenth. */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * The event pad: fire any effect on the strip as if it had just happened. Square pads
 * lit in each effect's colour, like a drum machine. Pick the side in its kit colours,
 * then hit a pad (or press its number key).
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
  const [hit, setHit] = useState<EffectKey | null>(null);
  const fire = (key: EffectKey) => {
    onFire(key, NEUTRAL.has(key) ? null : side);
    setHit(key);
    setTimeout(() => setHit((h) => (h === key ? null : h)), 350);
  };
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target;
    const typing =
      t instanceof Element &&
      !!t.closest("input, textarea, [contenteditable=true]");
    if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
    const i = KEYS.indexOf(e.key);
    if (i >= 0 && PAD_ORDER[i]) fire(PAD_ORDER[i]);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: onKey is an effect event, which must stay out of the deps
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Which team"
        className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1"
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
                "kl-display kl-press h-11 rounded-lg text-lg leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !on && "text-muted-foreground hover:text-foreground",
              )}
              style={
                on
                  ? { background: t.color, color: readableOn(t.color) }
                  : { boxShadow: `inset 0 -3px 0 ${t.color}` }
              }
            >
              {t.short}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {PAD_ORDER.map((key, i) => {
          const fx = EFFECTS[key];
          if (!fx) return null;
          const tint = EFFECT_TINT[key] ?? "#8f9bb2";
          const lit = hit === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => fire(key)}
              aria-keyshortcuts={KEYS[i]}
              className="group relative flex aspect-square flex-col items-start justify-between overflow-hidden rounded-xl border p-2.5 text-left outline-none transition-[transform,box-shadow] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              style={{
                borderColor: `${tint}66`,
                background: `radial-gradient(circle at 50% 30%, ${tint}${lit ? "88" : "40"}, ${tint}14 70%)`,
                boxShadow: lit
                  ? `0 0 22px ${tint}aa, inset 0 0 16px ${tint}88`
                  : "inset 0 -3px 0 rgb(0 0 0 / 0.35)",
              }}
            >
              <span className="hidden font-mono text-[0.625rem] text-muted-foreground lg:block">
                {KEYS[i] ?? ""}
              </span>
              <span className="mt-auto text-[0.8125rem] font-semibold leading-tight">
                {fx.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
