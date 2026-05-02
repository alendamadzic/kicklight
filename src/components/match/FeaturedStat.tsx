"use client";

import { Zap } from "lucide-react";
import type { Team } from "@/types";

// r = 15.915 → circumference ≈ 100, making dasharray values directly = percentages
const CX = 18;
const CY = 18;
const R = 15.915;
const SW = 2.8;

export function FeaturedStat({
  label,
  homePct,
  homeValue,
  awayValue,
  homeTeam,
  awayTeam,
  homeHex,
  awayHex,
  footerText,
}: {
  label: string;
  homePct: number;
  homeValue?: string;
  awayValue?: string;
  homeTeam: Team;
  awayTeam: Team;
  homeHex: string;
  awayHex: string;
  footerText?: string;
}) {
  const awayPct = 100 - homePct;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center gap-5">
        {/* Home */}
        <div className="flex min-w-[90px] flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className="max-w-[80px] truncate text-xs font-medium text-foreground/50">
              {homeTeam.name}
            </span>
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: homeHex }}
            />
          </div>
          <span
            className="font-display text-[2.5rem] font-bold leading-none tracking-tight"
            style={{ color: homeHex }}
          >
            {homeValue ?? `${homePct}%`}
          </span>
        </div>

        {/* Ring */}
        <div className="relative shrink-0">
          <svg
            viewBox="0 0 36 36"
            width={128}
            height={128}
            style={{
              filter: `drop-shadow(0 0 14px ${homeHex}50) drop-shadow(0 0 14px ${awayHex}50)`,
            }}
          >
            {/* Track */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.07"
              strokeWidth={SW}
            />

            {/* Away arc */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={awayHex}
              strokeWidth={SW}
              strokeLinecap="butt"
              strokeDasharray={`${awayPct} ${homePct}`}
              strokeDashoffset={100 - homePct}
              transform={`rotate(90 ${CX} ${CY})`}
              style={{
                transition:
                  "stroke-dasharray 700ms ease-in-out, stroke-dashoffset 700ms ease-in-out",
              }}
            />

            {/* Home arc */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={homeHex}
              strokeWidth={SW}
              strokeLinecap="butt"
              strokeDasharray={`${homePct} ${awayPct}`}
              strokeDashoffset="0"
              transform={`rotate(90 ${CX} ${CY})`}
              style={{
                transition: "stroke-dasharray 700ms ease-in-out",
              }}
            />
          </svg>

          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <Zap className="size-3.5 fill-amber-400 stroke-amber-400" />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-foreground/40">
              {label}
            </span>
          </div>
        </div>

        {/* Away */}
        <div className="flex min-w-[90px] flex-col items-start gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: awayHex }}
            />
            <span className="max-w-[80px] truncate text-xs font-medium text-foreground/50">
              {awayTeam.name}
            </span>
          </div>
          <span
            className="font-display text-[2.5rem] font-bold leading-none tracking-tight"
            style={{ color: awayHex }}
          >
            {awayValue ?? `${awayPct}%`}
          </span>
        </div>
      </div>

      {footerText && (
        <p className="text-center text-[11px] text-muted-foreground/60">
          {footerText}
        </p>
      )}
    </div>
  );
}
