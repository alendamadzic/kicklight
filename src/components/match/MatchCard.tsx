"use client";

import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TeamChip } from "@/components/ui/TeamChip";
import type { Match } from "@/types";

const statusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  TIMED: "Scheduled",
  IN_PLAY: "Live",
  PAUSED: "Half Time",
  EXTRA_TIME: "Extra Time",
  PENALTY_SHOOTOUT: "Penalties",
  FINISHED: "Full Time",
  SUSPENDED: "Suspended",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  AWARDED: "Awarded",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  IN_PLAY: "default",
  EXTRA_TIME: "default",
  PENALTY_SHOOTOUT: "default",
  PAUSED: "secondary",
  FINISHED: "outline",
  SCHEDULED: "outline",
  TIMED: "outline",
};

const liveStatuses = new Set(["IN_PLAY", "EXTRA_TIME", "PENALTY_SHOOTOUT"]);

function formatKickoffTime(utcDate: string): string {
  const date = new Date(utcDate);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MatchCard({
  match,
  onSelect,
}: {
  match: Match;
  onSelect: (match: Match) => void;
}) {
  const hasScore =
    match.score.fullTime.home !== null && match.score.fullTime.away !== null;
  const isLive = liveStatuses.has(match.status);

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <TeamChip team={match.homeTeam} size="md" className="flex-1" />
            {hasScore ? (
              <span className="font-display text-lg font-bold tabular-nums">
                {match.score.fullTime.home} – {match.score.fullTime.away}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">vs</span>
            )}
            <TeamChip
              team={match.awayTeam}
              size="md"
              className="flex-1 flex-row-reverse text-right"
            />
          </div>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <Badge variant={statusVariants[match.status] ?? "outline"}>
              {statusLabels[match.status] ?? match.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatKickoffTime(match.utcDate)}
            </span>
          </div>
        </div>
        <Button size="sm" onClick={() => onSelect(match)}>
          <Play className="size-3.5" />
          Watch
        </Button>
      </CardContent>
    </Card>
  );
}
