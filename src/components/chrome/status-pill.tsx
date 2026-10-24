import { LedBar } from "@/components/chrome/led-bar";
import { cn } from "@/lib/utils";

/** What the lights are doing, in the same words everywhere. */
export type LightsState =
  | "off"
  | "starting"
  | "live"
  | "sim"
  | "paused"
  | "ended";

/** Whether the Hue link can drive the strip. */
export type HueHealth =
  | "checking"
  | "connected"
  | "expiring"
  | "unreachable"
  | "not_linked";

const LIGHTS: Record<
  LightsState,
  { label: string; color: string; variant: "static" | "chase" | "live" | "off" }
> = {
  off: { label: "Lights off", color: "", variant: "off" },
  starting: { label: "Starting…", color: "var(--amber)", variant: "chase" },
  live: { label: "Live", color: "var(--live)", variant: "live" },
  sim: { label: "Simulation", color: "var(--live)", variant: "live" },
  paused: { label: "Paused", color: "var(--amber)", variant: "static" },
  ended: {
    label: "Lights restored",
    color: "var(--success)",
    variant: "static",
  },
};

const HEALTH: Record<HueHealth, { label: string; color: string }> = {
  checking: { label: "Checking…", color: "var(--muted-foreground)" },
  connected: { label: "Connected", color: "var(--success)" },
  expiring: { label: "Link expires soon", color: "var(--amber)" },
  unreachable: { label: "Not answering", color: "var(--destructive)" },
  not_linked: { label: "Not linked", color: "var(--muted-foreground)" },
};

const PILL =
  "inline-flex h-7 items-center gap-2 rounded-full bg-muted px-2.5 text-xs font-medium leading-none whitespace-nowrap";

export function StatusPill({
  state,
  label,
  className,
}: {
  state: LightsState;
  /** Overrides the standard label, e.g. "Sample preview". */
  label?: string;
  className?: string;
}) {
  const s = LIGHTS[state];
  return (
    <span className={cn(PILL, className)} aria-live="polite">
      <LedBar
        variant={s.variant}
        count={3}
        colors={s.color ? [s.color] : undefined}
        segmentClassName="h-1.5 w-1.5 rounded-full"
        className="gap-[2px]"
      />
      <span style={{ color: s.color || undefined }}>{label ?? s.label}</span>
    </span>
  );
}

export function HealthPill({
  health,
  className,
}: {
  health: HueHealth;
  className?: string;
}) {
  const h = HEALTH[health];
  return (
    <span className={cn(PILL, className)}>
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: h.color }}
      />
      {h.label}
    </span>
  );
}
