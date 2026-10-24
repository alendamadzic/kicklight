"use client";

import { SearchIcon, StarIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LedBar } from "@/components/chrome/led-bar";
import { MatchCard } from "@/components/match/match-card";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEAGUES, leagueName } from "@/engine/feed/leagues";
import { useAuth } from "@/hooks/use-auth";
import { useAllMatches, useFixtures } from "@/hooks/use-fixtures";
import { useLiveSession } from "@/hooks/use-live-session";
import { usePreferences } from "@/hooks/use-preferences";
import type { MatchListItem } from "@/lib/api-types";
import { isLivePhase } from "@/lib/format";
import { REPLAY_LEAGUE } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: "-1", label: "Yesterday" },
  { value: "0", label: "Today" },
  { value: "1", label: "Tomorrow" },
];

/** "all", "mine", or a league slug. */
type Filter = string;

const DISMISS_KEY = "kl:dismiss-signin";

interface Section {
  slug: string;
  name: string;
  group: string;
  matches: MatchListItem[];
}

export function FixturesView() {
  const [day, setDay] = useState(0);
  const { byLeague, loading, source, reason } = useFixtures(day);
  const all = useAllMatches(byLeague);
  const { prefs, update } = usePreferences();
  const { user, ready } = useAuth();
  const { session } = useLiveSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [dismissed, setDismissed] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

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
  const isMine = (m: MatchListItem) =>
    followed.has(m.home.id) || followed.has(m.away.id);
  const onLights = (m: MatchListItem) =>
    !!session && session.league === m.league && session.event_id === m.id;

  const sections: Section[] = [
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

  // If the chosen league has nothing on the new day, fall back to everything.
  const active =
    filter === "all" ||
    filter === "mine" ||
    sections.some((s) => s.slug === filter)
      ? filter
      : "all";
  const keep = (m: MatchListItem) =>
    active === "all" || (active === "mine" ? isMine(m) : m.league === active);

  const live = all.filter((m) => isLivePhase(m.phase) && keep(m));
  const shown = sections
    .map((s) => ({
      ...s,
      matches: s.matches.filter((m) => keep(m) && !isLivePhase(m.phase)),
    }))
    .filter((s) => s.matches.length);

  const filters = [
    { value: "mine", label: "Mine" },
    { value: "all", label: "All" },
    ...sections.map((s) => ({ value: s.slug, label: s.name })),
  ];

  const card = (m: MatchListItem) => (
    <MatchCard
      key={`${m.league}:${m.id}`}
      match={m}
      followedIds={followed}
      onToggleFollow={user ? toggleFollow : undefined}
      onYourLights={onLights(m)}
      kitOverrides={prefs.kit_overrides}
    />
  );

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage blocked: it stays hidden for this visit.
    }
  };

  const notice =
    source === "sample" && reason === "unavailable" ? (
      <p className="text-sm text-muted-foreground">
        The match feed isn't answering, so these are scripted samples.{" "}
        <Link
          href="/demo"
          className="text-foreground underline underline-offset-4"
        >
          Watch a demo match
        </Link>
      </p>
    ) : ready && !user && !dismissed ? (
      <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">
          {source === "sample" ? "These are samples. " : null}
          <Link
            href="/login"
            className="font-semibold underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to follow teams and start your lights.
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="kl-headline text-4xl sm:text-5xl">Matches</h1>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search teams, matches and leagues"
          className="kl-press flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] lg:block">
            ⌘K
          </kbd>
        </button>
      </header>

      {/* Day and league filters stay in reach while the list scrolls. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-2 border-b border-border/60 bg-background/95 px-4 pt-1 pb-2 backdrop-blur-md lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <ToggleGroup
          value={[String(day)]}
          onValueChange={(v) => v[0] && setDay(Number(v[0]))}
          spacing={1}
          aria-label="Day"
          className="w-full lg:w-auto lg:self-start"
        >
          {DAYS.map((d) => (
            <ToggleGroupItem
              key={d.value}
              value={d.value}
              className="kl-press h-10 flex-1 rounded-lg bg-secondary px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background lg:flex-none"
            >
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="kl-scroll-x -mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-24px),transparent)] lg:hidden">
          <FilterChips
            filters={filters}
            value={active}
            onChange={setFilter}
            className="w-max"
          />
        </div>
      </div>

      {notice}

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label="Leagues"
          className="hidden lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))] lg:flex lg:flex-col lg:gap-1 lg:self-start"
        >
          <span className="kl-eyebrow mb-1 px-3">Show</span>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active === f.value}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                active === f.value
                  ? "bg-secondary font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.value === "mine" ? (
                <StarIcon className="size-3.5 fill-amber stroke-amber" />
              ) : null}
              <span className="truncate">{f.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {loading && !sections.length ? (
            <div className="flex flex-col gap-2" aria-busy>
              <LedBar variant="chase" className="mb-1" />
              <Skeleton className="h-[5.5rem] w-full rounded-xl" />
              <Skeleton className="h-[5.5rem] w-full rounded-xl" />
            </div>
          ) : null}

          {live.length ? (
            <section aria-labelledby="live-now" className="flex flex-col gap-3">
              <h2
                id="live-now"
                className="flex items-center gap-2 text-sm font-semibold text-live"
              >
                <span className="kl-live-dot size-2 rounded-full bg-live" />
                Live now
              </h2>
              <div className="grid gap-2 xl:grid-cols-2">{live.map(card)}</div>
            </section>
          ) : null}

          {shown.map((s) => (
            <section
              key={s.slug}
              id={`league-${s.slug}`}
              aria-labelledby={`h-${s.slug}`}
              className="flex scroll-mt-32 flex-col gap-3"
            >
              <div className="flex items-baseline gap-2">
                <h2 id={`h-${s.slug}`} className="kl-headline text-2xl">
                  {s.name}
                </h2>
                <span className="kl-eyebrow">{s.group}</span>
              </div>
              <div className="grid gap-2 xl:grid-cols-2">
                {s.matches.map(card)}
              </div>
            </section>
          ))}

          {!loading && !live.length && !shown.length ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {active === "mine"
                ? followed.size
                  ? "None of your teams play on this day."
                  : "Follow a team from a match card's ⋯ menu and its matches show up here."
                : "No matches on this day. Try another day, or "}
              {active === "mine" ? null : (
                <Link href="/demo" className="underline underline-offset-2">
                  watch a demo match
                </Link>
              )}
              {active === "mine" ? null : "."}
            </p>
          ) : null}
        </div>
      </div>

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
            {sections.map((s) => (
              <CommandItem
                key={s.slug}
                value={`league ${s.name} ${s.group}`}
                onSelect={() => {
                  setSearchOpen(false);
                  setFilter(s.slug);
                }}
              >
                {s.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.group}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function FilterChips({
  filters,
  value,
  onChange,
  className,
}: {
  filters: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0])}
      spacing={1}
      aria-label="Show"
      className={className}
    >
      {filters.map((f) => (
        <ToggleGroupItem
          key={f.value}
          value={f.value}
          className="kl-press h-9 rounded-full bg-secondary px-3.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
        >
          {f.value === "mine" ? (
            <StarIcon
              data-icon="inline-start"
              className="fill-amber stroke-amber"
            />
          ) : null}
          {f.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
