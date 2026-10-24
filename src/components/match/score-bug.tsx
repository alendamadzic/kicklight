import { LivePill } from "@/components/match/live-pill";
import { TeamCrest } from "@/components/match/team-crest";
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
 * The broadcast score bug: two team-colour slabs either side of the score,
 * with the match clock hanging off the bottom like on TV. `compact` slims it
 * down below the `lg` breakpoint for sticky use above the strip.
 */
export function ScoreBug({
  home,
  away,
  score,
  clock,
  live = false,
  sub,
  compact = false,
  className,
}: {
  home: BugTeam;
  away: BugTeam;
  score: { home: number; away: number } | null;
  /** "63'" / "HT" / "FT" / kick-off time. */
  clock: string;
  live?: boolean;
  /** Small line under the clock, e.g. the league. */
  sub?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <Slab team={home} side="home" compact={compact} />
      <div
        className={cn(
          "flex min-w-[5.5rem] flex-col items-center justify-center gap-1 bg-white px-3 py-2 text-[#0b0e14]",
          compact && "max-lg:gap-0.5 max-lg:py-1.5",
        )}
      >
        <div
          className={cn(
            "kl-display flex items-center gap-1.5 text-[2.5rem] leading-none",
            compact && "max-lg:text-[2rem]",
          )}
        >
          <span>{score ? score.home : "–"}</span>
          <span className="text-[1.5rem] opacity-40">:</span>
          <span>{score ? score.away : "–"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {live ? <LivePill /> : null}
          <span className="kl-display rounded-sm bg-amber px-1.5 py-0.5 text-sm leading-none text-[#1a1200]">
            {clock || "—"}
          </span>
        </div>
        {sub ? (
          <span
            className={cn(
              "kl-eyebrow text-[0.625rem] !text-[#556078]",
              compact && "max-lg:hidden",
            )}
          >
            {sub}
          </span>
        ) : null}
      </div>
      <Slab team={away} side="away" compact={compact} />
    </div>
  );
}

function Slab({
  team,
  side,
  compact,
}: {
  team: BugTeam;
  side: "home" | "away";
  compact: boolean;
}) {
  const fg = readableOn(team.color);
  const right = side === "away";
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 px-3 py-3",
        compact && "max-lg:gap-2 max-lg:py-2",
        right ? "flex-row-reverse text-right" : "text-left",
      )}
      style={{ background: team.color, color: fg }}
    >
      <TeamCrest team={team} size={compact ? 30 : 36} className="shrink-0" />
      <div className="min-w-0">
        <div className="kl-display truncate text-2xl leading-none">
          {team.short}
        </div>
        <div
          className={cn(
            "mt-1 truncate text-[0.6875rem] font-medium leading-tight opacity-80",
            compact && "max-lg:hidden",
          )}
        >
          {team.name}
        </div>
      </div>
    </div>
  );
}
