"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Team } from "@/types";

export function StatBar({
  label,
  homePct,
  awayPct,
  homeValue,
  awayValue,
  homeHex,
  awayHex,
  footerText,
  isActive = false,
  onActivate,
  className,
}: {
  label: string;
  homePct: number;
  awayPct: number;
  homeValue?: string;
  awayValue?: string;
  homeTeam: Team;
  awayTeam: Team;
  homeHex: string;
  awayHex: string;
  footerText?: string;
  showTeamLabels?: boolean;
  isActive?: boolean;
  onActivate?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={!onActivate}
      className={cn(
        "group relative w-full rounded-lg px-3 py-2.5 text-left transition-all duration-200 disabled:cursor-default",
        isActive
          ? "bg-white/[0.04] ring-1 ring-white/10"
          : "hover:bg-white/[0.025] ring-1 ring-transparent hover:ring-white/[0.06]",
        className,
      )}
    >
      {/* Active left indicator */}
      {isActive && (
        <span
          className="absolute inset-y-2 left-0 w-px rounded-full"
          style={{ backgroundColor: "rgb(251 191 36)" }}
        />
      )}

      {/* Top row: label + values + indicator */}
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-widest transition-colors",
            isActive
              ? "text-foreground/70"
              : "text-muted-foreground/50 group-hover:text-muted-foreground/70",
          )}
        >
          {label}
        </span>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-display text-sm font-bold tabular-nums leading-none transition-colors",
              isActive ? "text-foreground/90" : "text-foreground/60",
            )}
          >
            <span style={{ color: isActive ? homeHex : undefined }}>
              {homeValue ?? `${homePct}%`}
            </span>
            <span className="mx-1.5 text-foreground/25">·</span>
            <span style={{ color: isActive ? awayHex : undefined }}>
              {awayValue ?? `${awayPct}%`}
            </span>
          </span>

          {isActive ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400 ring-1 ring-amber-500/20">
              <Zap className="size-2 fill-amber-400 stroke-amber-400" />
              Lights
            </span>
          ) : onActivate ? (
            <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/25 ring-1 ring-transparent transition-all group-hover:text-muted-foreground/50 group-hover:ring-foreground/10">
              <Zap className="size-2" />
              Use
            </span>
          ) : null}
        </div>
      </div>

      {/* Thin pill bar */}
      <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        {/* Home fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-in-out"
          style={{ width: `${homePct}%`, backgroundColor: homeHex }}
        />
        {/* Away fill */}
        <div
          className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-700 ease-in-out"
          style={{ width: `${awayPct}%`, backgroundColor: awayHex }}
        />
      </div>

      {footerText && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/40">{footerText}</p>
      )}
    </button>
  );
}
