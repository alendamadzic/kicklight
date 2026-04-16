"use client";

import { AlertTriangle } from "lucide-react";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { StatusDot, type StatusDotStatus } from "@/components/ui/StatusDot";
import { cn } from "@/lib/utils";

export function StatusBar({
  bridgeIp,
  lightName,
  nextPollTime,
  bridgeStatus = "disconnected",
  rateLimitWarning = false,
  onReconfigure,
  className,
}: {
  bridgeIp?: string;
  lightName?: string;
  nextPollTime?: Date;
  bridgeStatus?: StatusDotStatus;
  rateLimitWarning?: boolean;
  onReconfigure?: () => void;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t bg-card/80 px-6 py-2 text-xs backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <StatusDot status={bridgeStatus} />
        {bridgeIp ? (
          <span className="text-muted-foreground">
            <span className="font-mono">{bridgeIp}</span>
            {lightName && (
              <>
                {" "}
                &middot;{" "}
                <span className="inline-block max-w-[160px] truncate align-bottom text-foreground">
                  {lightName}
                </span>
              </>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">No bridge connected</span>
        )}
        {onReconfigure && (
          <button
            type="button"
            onClick={onReconfigure}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Reconfigure
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        {rateLimitWarning && (
          <span className="flex items-center gap-1.5 text-amber-500">
            <AlertTriangle className="size-3.5 shrink-0" />
            Rate limit — slowing polls
          </span>
        )}
        {nextPollTime && <CountdownTimer targetTime={nextPollTime} />}
      </div>
    </footer>
  );
}
