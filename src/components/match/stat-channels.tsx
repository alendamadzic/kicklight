"use client";

import { SparklesIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STAT_ORDER, type StatKey, statLabel } from "@/engine/stats";
import { cn } from "@/lib/utils";

const CHANNELS: StatKey[] = ["auto", ...STAT_ORDER];

/**
 * The stat "channels": a broadcast-menu row of what the lights follow. Scrolls
 * sideways on a phone; "Auto" is the director that switches for you.
 */
export function StatChannels({
  value,
  onValueChange,
  pending,
  disabled,
  className,
}: {
  value: StatKey;
  /** The chosen channel isn't on the lights yet. */
  pending?: boolean;
  onValueChange: (stat: StatKey) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "kl-scroll-x -mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-24px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]",
        className,
      )}
    >
      <ToggleGroup
        value={[value]}
        onValueChange={(v) => {
          const next = v[0] as StatKey | undefined;
          if (next) onValueChange(next);
        }}
        disabled={disabled}
        spacing={1}
        aria-label="What the lights follow"
        className="w-max sm:w-full sm:flex-wrap"
      >
        {CHANNELS.map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            aria-label={statLabel(key)}
            aria-busy={pending && key === value ? true : undefined}
            className={cn(
              "kl-display h-11 min-w-11 rounded-md bg-secondary px-3.5 text-[0.9375rem] leading-none text-muted-foreground",
              "hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background",
              "kl-press aria-busy:animate-pulse",
            )}
          >
            {key === "auto" ? <SparklesIcon data-icon="inline-start" /> : null}
            {statLabel(key)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
