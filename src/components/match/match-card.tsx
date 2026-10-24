"use client";

import { EllipsisIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LivePill } from "@/components/match/live-pill";
import { TeamCrest } from "@/components/match/team-crest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hexToRgb, liftForGlow, rgbToHex } from "@/engine/colors";
import type { MatchListItem } from "@/lib/api-types";
import { isLivePhase, kickoffLabel, minuteLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The colour a team would glow on the strip: a custom pick, else its lifted kit colour. */
export function glowHex(color: string, override?: string): string {
  if (override?.startsWith("#")) return override;
  return rgbToHex(liftForGlow(hexToRgb(color)));
}

/**
 * One fixture. The whole card opens the remote. A thin kit-colour edge previews
 * the lights it would make; following lives in the ⋯ menu (also right-click), so
 * one tap on the card always means "open".
 */
export function MatchCard({
  match,
  followedIds,
  onToggleFollow,
  onYourLights = false,
  kitOverrides,
  className,
}: {
  match: MatchListItem;
  followedIds: ReadonlySet<string>;
  onToggleFollow?: (teamId: string) => void;
  /** The lights are following this match right now. */
  onYourLights?: boolean;
  kitOverrides?: Readonly<Record<string, string>>;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const live = isLivePhase(match.phase);
  const finished = match.phase === "full_time";
  const started = match.phase !== "scheduled";
  const status = live
    ? minuteLabel(match.minute, match.phase)
    : finished
      ? "FT"
      : kickoffLabel(match.kickoff);
  const home = glowHex(match.home.color, kitOverrides?.[match.home.id]);
  const away = glowHex(match.away.color, kitOverrides?.[match.away.id]);
  const name = `${match.home.name} v ${match.away.name}`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: right-click is a mouse shortcut for the ⋯ menu, which keyboards reach directly
    <div
      onContextMenu={
        onToggleFollow
          ? (e) => {
              e.preventDefault();
              setMenuOpen(true);
            }
          : undefined
      }
      className={cn(
        "kl-press group/card relative flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/25",
        live && "border-live/40",
        onYourLights && "border-amber/60",
        className,
      )}
    >
      <Link
        href={`/match/${encodeURIComponent(match.league)}/${encodeURIComponent(match.id)}`}
        aria-label={onYourLights ? `${name}, on your lights` : name}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />
      {/* The lights it would make: home over away, in glow colours. */}
      <div aria-hidden className="flex w-1 shrink-0 flex-col">
        <span className="flex-1" style={{ background: home }} />
        <span className="flex-1" style={{ background: away }} />
      </div>
      <div className="pointer-events-none z-10 flex w-14 shrink-0 flex-col items-center justify-center gap-1 border-r border-border px-1">
        {live ? <LivePill label={null} /> : null}
        <span
          className={cn(
            "kl-display text-base leading-none",
            live ? "text-live" : "text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>
      <div className="pointer-events-none z-10 flex min-w-0 flex-1 flex-col justify-center py-1">
        {(["home", "away"] as const).map((side) => {
          const t = match[side];
          return (
            <div
              key={side}
              className="flex min-h-10 items-center gap-2.5 pl-3 pr-2"
            >
              <TeamCrest team={t} size={22} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-tight">
                {t.name}
                {followedIds.has(t.id) ? (
                  <StarIcon
                    aria-label="followed"
                    className="ml-1.5 inline size-3 -translate-y-px fill-amber stroke-amber"
                  />
                ) : null}
              </span>
              <span className="kl-display w-6 text-right text-xl leading-none tabular-nums">
                {started ? match.score[side] : ""}
              </span>
            </div>
          );
        })}
      </div>
      {onYourLights || onToggleFollow ? (
        <div className="z-10 flex shrink-0 flex-col items-end justify-center gap-1 pr-1">
          {onYourLights ? (
            <span className="pointer-events-none mr-1 rounded-full bg-amber/15 px-2 py-1 text-[0.6875rem] font-semibold leading-none whitespace-nowrap text-amber">
              On your lights
            </span>
          ) : null}
          {onToggleFollow ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                aria-label={`More for ${name}`}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none transition-[color,opacity] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100 sm:aria-expanded:opacity-100"
              >
                <EllipsisIcon className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {(["home", "away"] as const).map((side) => {
                  const t = match[side];
                  const on = followedIds.has(t.id);
                  return (
                    <DropdownMenuItem
                      key={side}
                      onClick={() => onToggleFollow(t.id)}
                    >
                      <StarIcon
                        className={cn(on && "fill-amber stroke-amber")}
                      />
                      {on ? `Unfollow ${t.name}` : `Follow ${t.name}`}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
