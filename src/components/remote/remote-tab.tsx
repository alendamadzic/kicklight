"use client";

import { PlayIcon } from "lucide-react";
import Link from "next/link";
import { LedBar } from "@/components/chrome/led-bar";
import { MatchCard } from "@/components/match/match-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useAllMatches, useFixtures } from "@/hooks/use-fixtures";
import { useLiveSession } from "@/hooks/use-live-session";
import { usePreferences } from "@/hooks/use-preferences";
import type { MatchListItem } from "@/lib/api-types";
import { MatchRemote } from "./match-remote";

/** The first not-yet-finished match a followed team plays, today then tomorrow. */
function nextFollowed(
  days: MatchListItem[][],
  followed: ReadonlySet<string>,
): MatchListItem | null {
  for (const day of days) {
    const mine = day
      .filter(
        (m) =>
          m.phase !== "full_time" &&
          (followed.has(m.home.id) || followed.has(m.away.id)),
      )
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    if (mine.length) return mine[0];
  }
  return null;
}

/**
 * The Remote tab: your running lights when a session is live, otherwise what's next
 * for your teams and a way to start. This is how you get back to the lights from anywhere.
 */
export function RemoteTab() {
  const { session, loading } = useLiveSession();
  const { prefs } = usePreferences();
  const { user, ready } = useAuth();
  const today = useAllMatches(useFixtures(0).byLeague);
  const tomorrow = useAllMatches(useFixtures(1).byLeague);
  const followed = new Set(prefs.followed_teams);

  if (session)
    return <MatchRemote league={session.league} id={session.event_id} />;

  if (loading || !ready)
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="aspect-[16/10] w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );

  const next = nextFollowed([today, tomorrow], followed);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <LedBar variant="off" />
        <h1 className="kl-headline text-4xl">Nothing on your lights</h1>
        <p className="text-sm text-muted-foreground">
          Start a match and the remote lives here: pause, change what the lights
          follow, match your TV and replay the big moments.
        </p>
      </header>

      {next ? (
        <section aria-labelledby="next-up" className="flex flex-col gap-3">
          <h2 id="next-up" className="text-sm font-semibold">
            Next up for your teams
          </h2>
          <MatchCard match={next} followedIds={followed} />
          <Link
            href={`/match/${encodeURIComponent(next.league)}/${encodeURIComponent(next.id)}`}
            className={buttonVariants({
              size: "lg",
              className: "h-12 rounded-xl text-base",
            })}
          >
            Open the remote for this match
          </Link>
          {prefs.auto_start ? (
            <p className="text-xs text-muted-foreground">
              Your lights start on their own 10 minutes before kick-off.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {user && followed.size
            ? "None of your teams play today or tomorrow."
            : "Follow a team from a match card's ⋯ menu and its next match shows up here."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/matches"
          className={buttonVariants({
            variant: next ? "secondary" : "default",
            className: "h-11 rounded-xl px-4",
          })}
        >
          Browse matches
        </Link>
        <Link
          href="/demo"
          className={buttonVariants({
            variant: "secondary",
            className: "h-11 rounded-xl px-4",
          })}
        >
          <PlayIcon data-icon="inline-start" />
          Watch a demo match
        </Link>
      </div>
    </div>
  );
}
