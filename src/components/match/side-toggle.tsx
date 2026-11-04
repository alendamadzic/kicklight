"use client";

import type { Side } from "@/engine/model";
import { readableOn } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Pick home or away, each button in its kit colour. Used by the event pad and the lights guide. */
export function SideToggle({
  side,
  onSideChange,
  home,
  away,
  label = "Which team",
  className,
}: {
  side: Side;
  onSideChange: (side: Side) => void;
  home: { short: string; color: string };
  away: { short: string; color: string };
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1",
        className,
      )}
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
  );
}
