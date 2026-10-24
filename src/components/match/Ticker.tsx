"use client";

import { RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ago } from "@/lib/format";
import {
  EFFECT_TINT,
  effectLabel,
  inTicker,
  type TickerItem,
} from "@/lib/ticker";
import { cn } from "@/lib/utils";

/**
 * "Hit the lights": a rolling list of the events that just lit the strip.
 * Rows show the match minute when the source knows it, otherwise how long ago.
 * The list has a fixed max height and scrolls, newest on top.
 * With `onReplay`, each row is a button that runs its effect on the lights again.
 */
export function Ticker({
  items,
  teams,
  emptyHint = "Nothing yet. Events show up here as they hit your lights.",
  limit = 40,
  onReplay,
  className,
}: {
  items: TickerItem[];
  teams: {
    home: { short: string; color: string };
    away: { short: string; color: string };
  };
  emptyHint?: string;
  limit?: number;
  onReplay?: (item: TickerItem) => void;
  className?: string;
}) {
  // Re-render each second so "12s ago" stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rows = items.filter(inTicker).slice(0, limit);

  if (!rows.length) {
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
    <ol
      className={cn(
        // Fixed height that cuts the last row in half, so it reads as scrollable.
        // The padding keeps the rows' focus rings clear of the scroll clip.
        "flex max-h-72 flex-col gap-1.5 overflow-y-auto overscroll-contain p-0.5",
        className,
      )}
      aria-live="polite"
    >
      {rows.map((item, i) => {
        const team = item.side ? teams[item.side] : null;
        const when = item.pad
          ? "PAD"
          : item.minute != null
            ? `${Math.floor(item.minute)}'`
            : ago(now - item.at);
        return (
          <li key={item.id} className={cn(i === 0 && "kl-rise")}>
            <Row
              onClick={onReplay ? () => onReplay(item) : undefined}
              label={`Replay ${effectLabel(item.effect)} on the lights`}
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
              {onReplay ? (
                <RotateCcwIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
                />
              ) : null}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

const ROW =
  "flex w-full items-center gap-3 rounded-lg bg-card px-3 py-2.5 text-left ring-1 ring-border";

function Row({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label: string;
  children: ReactNode;
}) {
  if (!onClick) return <div className={ROW}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        ROW,
        "group kl-press hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {children}
    </button>
  );
}
