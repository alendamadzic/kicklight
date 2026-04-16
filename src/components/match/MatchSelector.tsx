"use client";

import { AlertTriangle, Loader2, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getTodaysMatches } from "@/actions/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Match } from "@/types";
import { MatchCard } from "./MatchCard";

export function MatchSelector({
  onSelectMatch,
}: {
  onSelectMatch: (match: Match) => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getTodaysMatches();
    if (result.error) {
      setError(result.error);
    }
    setMatches(result.matches);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const filtered = filter
    ? matches.filter(
        (m) =>
          m.homeTeam.name.toLowerCase().includes(filter.toLowerCase()) ||
          m.awayTeam.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : matches;

  // Group by competition
  const grouped = filtered.reduce<Record<string, Match[]>>((acc, match) => {
    const comp = match.competition.name;
    if (!acc[comp]) acc[comp] = [];
    acc[comp].push(match);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 py-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Today&apos;s Matches
        </h2>
        <p className="text-sm text-muted-foreground">
          Select a match to sync with your Hue lights
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by team name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadMatches}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {matches.length === 0
              ? "No matches scheduled for today."
              : `No matches found for "${filter}".`}
          </p>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([competition, compMatches]) => (
            <div key={competition} className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {competition}
              </h3>
              <div className="flex flex-col gap-2">
                {compMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onSelect={onSelectMatch}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
