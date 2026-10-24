import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Thumb-reach controls pinned above the tab bar: Start, or Pause + Stop once running. */
export function RemoteControls({
  running,
  paused,
  starting,
  finished,
  otherLive,
  onStart,
  onTogglePause,
  onStop,
}: {
  running: boolean;
  paused: boolean;
  starting: boolean;
  /** The match is over: nothing left to start. */
  finished: boolean;
  /** The lights are following a different match. */
  otherLive: boolean;
  onStart: () => void;
  onTogglePause: () => void;
  onStop: () => void;
}) {
  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.5rem)] z-30 -mx-4 mt-2 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-1 pt-4 sm:bottom-4 sm:mx-0 sm:px-0">
      {running ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            size="lg"
            variant="secondary"
            onClick={onTogglePause}
            className="kl-display h-14 rounded-xl text-xl"
          >
            {paused ? (
              <PlayIcon data-icon="inline-start" />
            ) : (
              <PauseIcon data-icon="inline-start" />
            )}
            {paused ? "Resume lights" : "Pause lights"}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            onClick={onStop}
            aria-label="Stop and hand the lights back"
            className="kl-display h-14 rounded-xl px-5 text-xl"
          >
            <SquareIcon data-icon="inline-start" />
            Stop
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          onClick={onStart}
          disabled={starting || finished}
          className={cn(
            "kl-display h-14 w-full rounded-xl text-xl",
            starting && "opacity-80",
          )}
        >
          <PlayIcon data-icon="inline-start" />
          {finished
            ? "Match finished"
            : starting
              ? "Starting…"
              : otherLive
                ? "Switch lights to this match"
                : "Start lights"}
        </Button>
      )}
    </div>
  );
}
