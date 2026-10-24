"use client";

import { LightbulbIcon, PlayIcon, SearchIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "@/components/match/match-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEAGUES, leagueName } from "@/engine/feed/leagues";
import { useAuth } from "@/hooks/use-auth";
import { useAllMatches, useFixtures } from "@/hooks/use-fixtures";
import { usePreferences } from "@/hooks/use-preferences";
import { REPLAY_LEAGUE } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: "-1", label: "Yesterday" },
  { value: "0", label: "Today" },
  { value: "1", label: "Tomorrow" },
];

export function FixturesView() {
  const [day, setDay] = useState(0);
  const { byLeague, loading, source, reason } = useFixtures(day);
  const all = useAllMatches(byLeague);
  const { prefs, update } = usePreferences();
  const { user, ready } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const followed = useMemo(
    () => new Set(prefs.followed_teams),
    [prefs.followed_teams],
  );
  const toggleFollow = (id: string) =>
    update({
      followed_teams: followed.has(id)
        ? prefs.followed_teams.filter((t) => t !== id)
        : [...prefs.followed_teams, id],
    });

  const mine = all.filter(
    (m) => followed.has(m.home.id) || followed.has(m.away.id),
  );

  const sections = [
    ...LEAGUES.filter((l) => byLeague[l.slug]?.length).map((l) => ({
      slug: l.slug,
      name: l.name,
      group: l.group as string,
      matches: byLeague[l.slug],
    })),
    ...(byLeague[REPLAY_LEAGUE]?.length
      ? [
          {
            slug: REPLAY_LEAGUE,
            name: "Sample matches",
            group: "Scripted",
            matches: byLeague[REPLAY_LEAGUE],
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="kl-eyebrow">Fixtures</p>
            <h1 className="kl-display text-4xl leading-none sm:text-5xl">
              Pick a match
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="kl-press flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 text-left text-muted-foreground outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-sm">
            Search teams, matches, leagues
          </span>
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] sm:block">
            ⌘K
          </kbd>
        </button>
        <ToggleGroup
          value={[String(day)]}
          onValueChange={(v) => v[0] && setDay(Number(v[0]))}
          spacing={1}
          aria-label="Day"
          className="w-full"
        >
          {DAYS.map((d) => (
            <ToggleGroupItem
              key={d.value}
              value={d.value}
              className="kl-display kl-press h-11 flex-1 rounded-md bg-secondary text-base leading-none text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>

      {source === "sample" ? (
        <Alert>
          <LightbulbIcon />
          <AlertTitle>
            {reason === "signed_out"
              ? "Sign in for real fixtures"
              : "Showing sample matches"}
          </AlertTitle>
          <AlertDescription>
            <span>
              {reason === "signed_out"
                ? "These are scripted samples. Sign in to see today's matches and follow your teams."
                : "The match feed isn't reachable, so these are scripted samples."}
            </span>
            <span className="mt-3 flex flex-wrap gap-2">
              {reason === "signed_out" ? (
                <Link href="/login" className={buttonVariants({ size: "sm" })}>
                  Sign in
                </Link>
              ) : null}
              <Link
                href="/demo"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PlayIcon data-icon="inline-start" />
                Try the demo
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {ready && !user && source === "api" ? (
        <Alert>
          <AlertTitle>Sign in to light up your strip</AlertTitle>
          <AlertDescription>
            <Link href="/login" className="underline underline-offset-2">
              Get a magic link
            </Link>{" "}
            to follow teams and start a match.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="my-teams" className="flex flex-col gap-3">
        <SectionTitle
          id="my-teams"
          icon={<StarIcon className="size-4 fill-amber stroke-amber" />}
        >
          My teams
        </SectionTitle>
        {mine.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {mine.map((m) => (
              <MatchCard
                key={`${m.league}:${m.id}`}
                match={m}
                followedIds={followed}
                onToggleFollow={toggleFollow}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            {followed.size
              ? "None of your teams play on this day."
              : "Tap the star next to a team and its matches are pinned here first."}
          </p>
        )}
      </section>

      <section
        aria-labelledby="auto-start"
        className="kl-panel flex items-center gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <h2 id="auto-start" className="kl-display text-lg leading-none">
            Auto-start 10 min before kick-off
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Your lights join in on their own when a followed team is about to
            play.
          </p>
        </div>
        <Switch
          aria-labelledby="auto-start"
          checked={prefs.auto_start}
          onCheckedChange={(v) => update({ auto_start: v })}
        />
      </section>

      {loading && !sections.length ? (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[5.5rem] w-full rounded-xl" />
          <Skeleton className="h-[5.5rem] w-full rounded-xl" />
        </div>
      ) : null}

      {sections.map((s) => (
        <section
          key={s.slug}
          id={`league-${s.slug}`}
          aria-labelledby={`h-${s.slug}`}
          className="flex scroll-mt-20 flex-col gap-3"
        >
          <SectionTitle id={`h-${s.slug}`} sub={s.group}>
            {s.name}
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.matches.map((m) => (
              <MatchCard
                key={`${m.league}:${m.id}`}
                match={m}
                followedIds={followed}
                onToggleFollow={toggleFollow}
              />
            ))}
          </div>
        </section>
      ))}

      {!loading && !sections.length ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No matches on this day. Try another day, or{" "}
          <Link href="/demo" className="underline underline-offset-2">
            play a scripted match
          </Link>
          .
        </p>
      ) : null}

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search"
        description="Search matches, teams and leagues"
      >
        <CommandInput placeholder="Team, match or league" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {all.length ? (
            <CommandGroup heading="Matches">
              {all.map((m) => (
                <CommandItem
                  key={`${m.league}:${m.id}`}
                  value={`${m.home.name} ${m.away.name} ${m.home.short} ${m.away.short} ${leagueName(m.league)}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    router.push(
                      `/match/${encodeURIComponent(m.league)}/${encodeURIComponent(m.id)}`,
                    );
                  }}
                >
                  <span className="truncate">
                    {m.home.name} v {m.away.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {leagueName(m.league)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Leagues">
            {LEAGUES.map((l) => (
              <CommandItem
                key={l.slug}
                value={`league ${l.name} ${l.group}`}
                onSelect={() => {
                  setSearchOpen(false);
                  document
                    .getElementById(`league-${l.slug}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {l.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {l.group}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function SectionTitle({
  id,
  children,
  sub,
  icon,
}: {
  id: string;
  children: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      {icon}
      <h2 id={id} className="kl-display text-2xl leading-none">
        {children}
      </h2>
      {sub ? <span className={cn("kl-eyebrow")}>{sub}</span> : null}
    </div>
  );
}
