"use client";

import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { leagueName } from "@/engine/feed/leagues";
import type { MatchListItem } from "@/lib/api-types";

/**
 * ⌘K search over the day's matches and leagues. Its own file so the fixtures page can load
 * it (and cmdk) only when someone first opens it.
 */
export function FixturesSearch({
  open,
  onOpenChange,
  matches,
  leagues,
  onPickLeague,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: MatchListItem[];
  leagues: { slug: string; name: string; group: string }[];
  onPickLeague: (slug: string) => void;
}) {
  const router = useRouter();
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search matches, teams and leagues"
    >
      <CommandInput placeholder="Team, match or league" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        {matches.length ? (
          <CommandGroup heading="Matches">
            {matches.map((m) => (
              <CommandItem
                key={`${m.league}:${m.id}`}
                value={`${m.home.name} ${m.away.name} ${m.home.short} ${m.away.short} ${leagueName(m.league)}`}
                onSelect={() => {
                  onOpenChange(false);
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
          {leagues.map((s) => (
            <CommandItem
              key={s.slug}
              value={`league ${s.name} ${s.group}`}
              onSelect={() => {
                onOpenChange(false);
                onPickLeague(s.slug);
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
  );
}
