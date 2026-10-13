"use client";

import { useEffect, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ago } from "@/lib/format";
import { EFFECT_TINT, effectLabel, type TickerItem } from "@/lib/ticker";
import { cn } from "@/lib/utils";

/**
 * "Hit the lights": a rolling list of the events that just lit the strip.
 * Rows show the match minute when the source knows it, otherwise how long ago.
 */
export function Ticker({
  items,
  teams,
  emptyHint = "Nothing yet. Events show up here as they hit your lights.",
  limit = 8,
  className,
}: {
  items: TickerItem[];
  teams: {
    home: { short: string; color: string };
    away: { short: string; color: string };
  };
  emptyHint?: string;
  limit?: number;
  className?: string;
}) {
  // Re-render each second so "12s ago" stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!items.length) {
    return (
      <Empty className={cn("kl-panel border-dashed p-6", className)}>
        <EmptyHeader>
          <EmptyTitle className="kl-display text-lg">Quiet so far</EmptyTitle>
          <EmptyDescription>{emptyHint}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ol className={cn("flex flex-col gap-1.5", className)} aria-live="polite">
      {items.slice(0, limit).map((item, i) => {
        const team = item.side ? teams[item.side] : null;
        const when = item.pad
          ? "PAD"
          : item.minute != null
            ? `${Math.floor(item.minute)}'`
            : ago(now - item.at);
        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-border",
              i === 0 && "kl-rise",
            )}
          >
            <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {when}
            </span>
            <span
              aria-hidden
              className="h-4 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: EFFECT_TINT[item.effect] ?? "#8f9bb2" }}
            />
            <span className="kl-display min-w-0 flex-1 truncate text-base leading-none">
              {effectLabel(item.effect)}
            </span>
            {team ? (
              <span className="kl-display flex items-center gap-1.5 text-sm leading-none text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: team.color }}
                />
                {team.short}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
