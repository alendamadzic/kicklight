"use client";

import { StarIcon } from "lucide-react";
import Link from "next/link";
import { LivePill } from "@/components/match/LivePill";
import { TeamCrest } from "@/components/match/TeamCrest";
import type { MatchListItem } from "@/lib/api-types";
import { isLivePhase, kickoffLabel, minuteLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One fixture. The whole card opens the remote; each team has its own star
 * for "my teams". The link is a stretched overlay so the stars stay tappable.
 */
export function MatchCard({
  match,
  followedIds,
  onToggleFollow,
  className,
}: {
  match: MatchListItem;
  followedIds: ReadonlySet<string>;
  onToggleFollow?: (teamId: string) => void;
  className?: string;
}) {
  const live = isLivePhase(match.phase);
  const finished = match.phase === "full_time";
  const started = match.phase !== "scheduled";
  const status = live
    ? minuteLabel(match.minute, match.phase)
    : finished
      ? "FT"
      : kickoffLabel(match.kickoff);

  return (
    <div
      className={cn(
        "kl-press group/card relative flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/25",
        live && "border-live/40",
        className,
      )}
    >
      <Link
        href={`/match/${encodeURIComponent(match.league)}/${encodeURIComponent(match.id)}`}
        aria-label={`${match.home.name} v ${match.away.name}`}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />
      <div className="pointer-events-none z-10 flex w-14 shrink-0 flex-col items-center justify-center gap-1 border-r border-border px-1">
        {live ? <LivePill label={null} /> : null}
        <span
          className={cn(
            "kl-display text-lg leading-none",
            live ? "text-live" : "text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {(["home", "away"] as const).map((side) => {
          const t = match[side];
          const isFollowed = followedIds.has(t.id);
          return (
            <div
              key={side}
              className="pointer-events-none z-10 flex min-h-11 items-center gap-2.5 pl-3"
            >
              <TeamCrest team={t} size={22} className="shrink-0" />
              <span className="kl-display min-w-0 flex-1 truncate text-xl leading-none">
                {t.name}
              </span>
              <span className="kl-display w-6 text-right text-xl leading-none tabular-nums">
                {started ? match.score[side] : ""}
              </span>
              {onToggleFollow ? (
                <button
                  type="button"
                  aria-label={
                    isFollowed ? `Unfollow ${t.name}` : `Follow ${t.name}`
                  }
                  aria-pressed={isFollowed}
                  onClick={() => onToggleFollow(t.id)}
                  className="pointer-events-auto grid size-11 shrink-0 place-items-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <StarIcon
                    className={cn(
                      "size-[1.125rem]",
                      isFollowed && "fill-amber stroke-amber",
                    )}
                  />
                </button>
              ) : (
                <span className="w-3" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
