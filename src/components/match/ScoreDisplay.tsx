import { StatusDot, type StatusDotStatus } from "@/components/ui/StatusDot";
import { TeamChip } from "@/components/ui/TeamChip";
import type { LiveMatch } from "@/types";

const statusMap: Record<string, { label: string; status: StatusDotStatus }> = {
  IN_PLAY: { label: "LIVE", status: "live" },
  PAUSED: { label: "HT", status: "paused" },
  EXTRA_TIME: { label: "ET", status: "live" },
  PENALTY_SHOOTOUT: { label: "PEN", status: "live" },
  FINISHED: { label: "FT", status: "finished" },
  SCHEDULED: { label: "PRE", status: "scheduled" },
  TIMED: { label: "PRE", status: "scheduled" },
  SUSPENDED: { label: "SUS", status: "disconnected" },
  POSTPONED: { label: "PPD", status: "disconnected" },
  CANCELLED: { label: "CAN", status: "disconnected" },
  AWARDED: { label: "AWD", status: "finished" },
};

export function ScoreDisplay({
  match,
  homeHex,
  awayHex,
}: {
  match: LiveMatch;
  homeHex?: string;
  awayHex?: string;
}) {
  const homeScore = match.score.fullTime.home ?? 0;
  const awayScore = match.score.fullTime.away ?? 0;
  const { label, status } = statusMap[match.status] ?? {
    label: match.status,
    status: "disconnected" as StatusDotStatus,
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <StatusDot status={status} label={label} />
      <div className="flex items-center gap-6">
        <TeamChip team={match.homeTeam} size="lg" hex={homeHex} />
        <div className="font-display text-5xl font-bold tabular-nums tracking-tight">
          {homeScore}
          <span className="mx-2 text-muted-foreground">–</span>
          {awayScore}
        </div>
        <TeamChip
          team={match.awayTeam}
          size="lg"
          hex={awayHex}
          className="flex-row-reverse"
        />
      </div>
      {match.minute != null && (
        <span className="text-sm tabular-nums text-muted-foreground">
          {match.minute}&apos;
        </span>
      )}
    </div>
  );
}
