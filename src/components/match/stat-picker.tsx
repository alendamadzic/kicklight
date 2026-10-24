"use client";

import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { ResponsiveOverlay } from "@/components/chrome/responsive-overlay";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Side } from "@/engine/model";
import {
  STAT_ORDER,
  type StatKey,
  statDescription,
  statLabel,
} from "@/engine/stats";
import type { AutoReason } from "@/engine/stats/auto";
import { cn } from "@/lib/utils";

/** The chips always on show; everything else lives behind More. */
const QUICK: StatKey[] = ["auto", "possession", "momentum", "scoreline"];

export interface StatPreview {
  share: number;
  values: [string, string] | null;
}

/** Auto's pick in words, e.g. "Liverpool are pressing, so it follows momentum". */
export function autoReasonText(
  reason: AutoReason | undefined,
  active: StatKey,
  pressing?: string,
): string {
  const follows = `it follows ${statLabel(active).toLowerCase()}`;
  if (reason === "late_close") return `Close game late on, so ${follows}`;
  if (reason === "pressure")
    return `${pressing ? `${pressing} are` : "One side is"} pressing, so ${follows}`;
  if (reason === "steady") return `A settled spell, so ${follows}`;
  return `Now: ${statLabel(active)}`;
}

/**
 * "Lights follow": Auto plus the three most used stats as chips, and More for a
 * panel that explains every option with a preview of the split it would give now.
 */
export function StatPicker({
  value,
  activeStat,
  autoReason,
  autoSide,
  teams,
  pending,
  preview,
  onChange,
  className,
}: {
  value: StatKey;
  /** What Auto resolved to. */
  activeStat: StatKey;
  autoReason?: AutoReason;
  autoSide?: Side;
  teams: Record<Side, { name: string; color: string }>;
  /** The chosen stat isn't on the lights yet. */
  pending?: boolean;
  /** The split each stat would give right now, when the match data allows it. */
  preview?: (key: StatKey) => StatPreview | null;
  onChange: (stat: StatKey) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const chips = QUICK.includes(value) ? QUICK : [...QUICK, value];
  const pressing = autoSide ? teams[autoSide].name : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="kl-scroll-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-1 sm:w-full sm:flex-wrap">
          <ToggleGroup
            value={[value]}
            onValueChange={(v) => {
              const next = v[0] as StatKey | undefined;
              if (next) onChange(next);
            }}
            spacing={1}
            aria-label="What the lights follow"
          >
            {chips.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                aria-busy={pending && key === value ? true : undefined}
                className="kl-press h-10 rounded-full bg-secondary px-3.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-busy:animate-pulse"
              >
                {key === "auto" ? (
                  <SparklesIcon data-icon="inline-start" />
                ) : null}
                {statLabel(key)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ResponsiveOverlay
            open={open}
            onOpenChange={setOpen}
            title="What should the lights follow?"
            description="The strip splits between the kits by this. Previews show the split right now."
            trigger={
              <button
                type="button"
                className="kl-press inline-flex h-10 items-center gap-1 rounded-full bg-secondary px-3.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                More
                <ChevronDownIcon className="size-4" />
              </button>
            }
          >
            <ul className="flex flex-col gap-1">
              {(["auto", ...STAT_ORDER] as StatKey[]).map((key) => {
                const p = preview?.(key === "auto" ? activeStat : key) ?? null;
                const on = key === value;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(key);
                        setOpen(false);
                      }}
                      aria-pressed={on}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        on
                          ? "bg-amber/15 ring-1 ring-amber/50"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          {key === "auto" ? (
                            <SparklesIcon className="size-3.5 text-amber" />
                          ) : null}
                          {statLabel(key)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {key === "auto"
                            ? autoReasonText(autoReason, activeStat, pressing)
                            : statDescription(key)}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        {p?.values ? (
                          <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
                            {p.values[0]} · {p.values[1]}
                          </span>
                        ) : null}
                        {p ? (
                          <span
                            aria-hidden
                            className="flex h-1.5 w-full overflow-hidden rounded-full"
                          >
                            <span
                              style={{
                                width: `${Math.round(p.share * 100)}%`,
                                background: teams.home.color,
                              }}
                            />
                            <span
                              className="flex-1"
                              style={{ background: teams.away.color }}
                            />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ResponsiveOverlay>
        </div>
      </div>
      {value === "auto" ? (
        <p className="text-xs text-muted-foreground">
          {autoReasonText(autoReason, activeStat, pressing)}
        </p>
      ) : null}
    </div>
  );
}
