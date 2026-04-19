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
  homeTeam,
  awayTeam,
  homeHex,
  awayHex,
  footerText,
  showTeamLabels = true,
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
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Label row — doubles as activation control */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {isActive ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-amber-500/25">
            <Zap className="size-2.5 fill-amber-400 stroke-amber-400" />
            Lights
          </span>
        ) : onActivate ? (
          <button
            onClick={onActivate}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground/40 ring-1 ring-foreground/10 transition-all hover:text-muted-foreground hover:ring-foreground/25"
          >
            <Zap className="size-2.5" />
            Use for lights
          </button>
        ) : null}
      </div>

      {/* Team labels */}
      {showTeamLabels && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: homeHex }}
            />
            <span className="text-xs font-medium text-foreground/80">
              {homeTeam.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/80">
              {awayTeam.name}
            </span>
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: awayHex }}
            />
          </div>
        </div>
      )}

      {/* Bar */}
      <div
        className={cn(
          "relative flex h-20 w-full overflow-hidden rounded-xl transition-shadow duration-500",
          isActive ? "ring-2 ring-white/15" : "ring-1 ring-foreground/10",
        )}
        style={{
          boxShadow: isActive
            ? `0 0 80px -8px ${homeHex}90, 0 0 80px -8px ${awayHex}90`
            : `0 0 60px -12px ${homeHex}60, 0 0 60px -12px ${awayHex}60`,
        }}
      >
        {/* Home side */}
        <div
          className="relative flex items-center justify-center overflow-hidden transition-[width] duration-700 ease-in-out"
          style={{
            width: `${homePct}%`,
            backgroundColor: homeHex,
          }}
        >
          <span className="relative z-10 font-display text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
            {homeValue ?? `${homePct}%`}
          </span>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 55%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden dark:block"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)" }}
          />
        </div>

        {/* Divider */}
        <div
          className="absolute inset-y-0 z-20 w-px bg-white/25"
          style={{ left: `${homePct}%` }}
        />

        {/* Away side */}
        <div
          className="relative flex items-center justify-center overflow-hidden transition-[width] duration-700 ease-in-out"
          style={{
            width: `${awayPct}%`,
            backgroundColor: awayHex,
          }}
        >
          <span className="relative z-10 font-display text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
            {awayValue ?? `${awayPct}%`}
          </span>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(225deg, rgba(255,255,255,0.18) 0%, transparent 55%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden dark:block"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)" }}
          />
        </div>
      </div>

      {footerText && (
        <p className="text-center text-xs text-muted-foreground">{footerText}</p>
      )}
    </div>
  );
}
