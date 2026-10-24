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
