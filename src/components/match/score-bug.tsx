import type { ReactElement, ReactNode } from "react";
import type { Side } from "@/engine/model";
import { readableOn } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BugTeam {
  name: string;
  short: string;
  /** #rrggbb used for the team slab. */
  color: string;
  crest?: string;
}

/**
 * The bug as it sits on the TV screen, top-left like a real broadcast: two kit
 * slabs, the score and the clock. Sized off the screen's width, so it scales with
 * the virtual TV. Render it inside `VirtualStrip`'s `screen` slot.
 *
 * With `wrapTeam`, each team's slab is a button (its hit area larger than the slab)
 * and `wrapTeam` decides what it opens, e.g. the kit colour picker.
 */
export function OnscreenBug({
  home,
  away,
  score,
  clock,
  wrapTeam,
  className,
}: {
  home: Pick<BugTeam, "short" | "color"> & { name?: string };
  away: Pick<BugTeam, "short" | "color"> & { name?: string };
  score: { home: number; away: number } | null;
  clock: string;
  wrapTeam?: (side: Side, slab: ReactElement) => ReactNode;
  className?: string;
}) {
  const slab = (side: Side) => {
    const t = side === "home" ? home : away;
    const style = { background: t.color, color: readableOn(t.color) };
    if (!wrapTeam)
      return (
        <span className="flex items-center px-[1.6cqw]" style={style}>
          {t.short}
        </span>
      );
    return wrapTeam(
      side,
      <button
        type="button"
        aria-label={`Change ${t.name ?? t.short}'s colour`}
        className="pointer-events-auto relative flex cursor-pointer items-center px-[1.6cqw] outline-none transition-[filter] after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-amber"
        style={style}
      >
        {t.short}
      </button>,
    );
  };
  return (
    <div
      className={cn(
        "@container pointer-events-none absolute inset-0",
        className,
      )}
    >
      <div className="kl-display absolute top-[5cqw] left-[4cqw] flex h-[7cqw] min-h-4 items-stretch rounded-[0.8cqw] text-[clamp(9px,4.4cqw,20px)] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.55)] [&>*:first-child]:rounded-l-[0.8cqw] [&>*:last-child]:rounded-r-[0.8cqw]">
        {slab("home")}
        <span className="flex items-center gap-[0.8cqw] bg-white px-[1.8cqw] text-[#0b0e14]">
          {score ? `${score.home}–${score.away}` : "v"}
        </span>
        {slab("away")}
        {clock ? (
          <span className="flex items-center bg-amber px-[1.6cqw] text-[#1a1200]">
            {clock}
          </span>
        ) : null}
      </div>
    </div>
  );
}
