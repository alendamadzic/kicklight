import { cn } from "@/lib/utils";

export type StatusDotStatus =
  | "connected"
  | "disconnected"
  | "live"
  | "paused"
  | "finished"
  | "scheduled";

const statusColors: Record<StatusDotStatus, string> = {
  connected: "bg-emerald-500",
  live: "bg-emerald-500",
  paused: "bg-amber-500",
  scheduled: "bg-amber-500",
  disconnected: "bg-zinc-500",
  finished: "bg-zinc-500",
};

const statusPulse: Record<StatusDotStatus, boolean> = {
  connected: false,
  live: true,
  paused: false,
  scheduled: false,
  disconnected: false,
  finished: false,
};

export function StatusDot({
  status,
  label,
  className,
}: {
  status: StatusDotStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-2">
        {statusPulse[status] && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75",
              statusColors[status],
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            statusColors[status],
          )}
        />
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
