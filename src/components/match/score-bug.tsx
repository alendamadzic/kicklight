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
 */
export function OnscreenBug({
  home,
  away,
  score,
  clock,
  className,
}: {
  home: Pick<BugTeam, "short" | "color">;
  away: Pick<BugTeam, "short" | "color">;
  score: { home: number; away: number } | null;
  clock: string;
  className?: string;
}) {
  return (
    <div className={cn("@container absolute inset-0", className)}>
      <div className="kl-display absolute top-[5cqw] left-[4cqw] flex h-[7cqw] min-h-4 items-stretch overflow-hidden rounded-[0.8cqw] text-[clamp(9px,4.4cqw,20px)] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
        <span
          className="flex items-center px-[1.6cqw]"
          style={{ background: home.color, color: readableOn(home.color) }}
        >
          {home.short}
        </span>
        <span className="flex items-center gap-[0.8cqw] bg-white px-[1.8cqw] text-[#0b0e14]">
          {score ? `${score.home}–${score.away}` : "v"}
        </span>
        <span
          className="flex items-center px-[1.6cqw]"
          style={{ background: away.color, color: readableOn(away.color) }}
        >
          {away.short}
        </span>
        {clock ? (
          <span className="flex items-center bg-amber px-[1.6cqw] text-[#1a1200]">
            {clock}
          </span>
        ) : null}
      </div>
    </div>
  );
}
