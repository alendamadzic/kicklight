import { LivePill } from "@/components/match/live-pill";
import type { RemoteMode } from "./use-remote-view-model";

/** Top-right badge: what the remote is showing and whether the lights are running. */
export function StatusChip({
  mode,
  paused,
  starting,
  preview,
}: {
  mode: RemoteMode;
  paused: boolean;
  starting: boolean;
  preview: boolean;
}) {
  if (mode === "preview") {
    return (
      <span className="kl-display rounded-md bg-muted px-2.5 py-1.5 text-sm leading-none text-muted-foreground">
        {preview ? "Sample preview" : "Preview · lights off"}
      </span>
    );
  }
  if (starting) {
    return (
      <span className="kl-display rounded-md bg-muted px-2.5 py-1.5 text-sm leading-none text-muted-foreground">
        Starting…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
      {paused ? (
        <span className="kl-display text-sm leading-none text-amber">
          Paused
        </span>
      ) : (
        <LivePill label={mode === "sim" ? "Simulation" : "Lights live"} />
      )}
    </span>
  );
}
