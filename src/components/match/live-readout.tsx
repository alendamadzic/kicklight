import { type StatKey, statLabel } from "@/engine/stats";
import { cn } from "@/lib/utils";

// r = 15.915 makes the circumference ~100, so dasharray values read as percentages.
const R = 15.915;

/**
 * The readout for whatever stat is on the lights: a donut ring split in the two
 * kit colours, the two values either side and a slim bar underneath.
 */
export function LiveReadout({
  stat,
  autoPick,
  pending,
  share,
  values,
  home,
  away,
  className,
}: {
  /** The stat the viewer selected (may be "auto"). */
  stat: StatKey;
  /** What auto resolved to right now. */
  autoPick?: StatKey | null;
  /** A new stat is on its way to the lights; this still shows the old one. */
  pending?: boolean;
  /** Home share 0..1, or null when unknown. */
  share: number | null;
  values: [string, string] | null;
  home: { short: string; color: string };
  away: { short: string; color: string };
  className?: string;
}) {
  const pct = Math.round((share ?? 0.5) * 100);
  const awayPct = 100 - pct;
  const [hv, av] = values ?? [`${pct}%`, `${awayPct}%`];
  const label =
    stat === "auto" && autoPick ? statLabel(autoPick) : statLabel(stat);

  return (
    <div
      className={cn(
        "kl-panel flex flex-col gap-4 p-4 transition-opacity duration-300",
        pending && "opacity-50",
        className,
      )}
      aria-busy={pending || undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start">
          <span className="kl-display truncate text-sm leading-none text-muted-foreground">
            {home.short}
          </span>
          <span
            className="kl-display text-[2.75rem] leading-none"
            style={{ color: home.color }}
          >
            {hv}
          </span>
        </div>

        <div className="relative shrink-0">
          <svg
            viewBox="0 0 36 36"
            className="size-28"
            style={{
              filter: `drop-shadow(0 0 12px ${home.color}55) drop-shadow(0 0 12px ${away.color}55)`,
            }}
            role="img"
            aria-label={`${label}: ${home.short} ${hv}, ${away.short} ${av}`}
          >
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeWidth="3"
            />
            {/* Mirrored so the home arc sweeps down the left, matching the home value and the bar. */}
            <g transform="translate(36 0) scale(-1 1) rotate(-90 18 18)">
              <circle
                cx="18"
                cy="18"
                r={R}
                fill="none"
                stroke={away.color}
                strokeWidth="3"
                strokeDasharray={`${awayPct} ${pct}`}
                strokeDashoffset={-pct}
                className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-in-out motion-reduce:transition-none"
              />
              <circle
                cx="18"
                cy="18"
                r={R}
                fill="none"
                stroke={home.color}
                strokeWidth="3"
                strokeDasharray={`${pct} ${awayPct}`}
                className="transition-[stroke-dasharray] duration-700 ease-in-out motion-reduce:transition-none"
              />
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="kl-eyebrow text-[0.5625rem]">
              {pending ? "Switching" : stat === "auto" ? "Auto" : "Lights"}
            </span>
            <span className="kl-display px-2 text-base leading-tight">
              {label}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-end">
          <span className="kl-display truncate text-sm leading-none text-muted-foreground">
            {away.short}
          </span>
          <span
            className="kl-display text-[2.75rem] leading-none"
            style={{ color: away.color }}
          >
            {av}
          </span>
        </div>
      </div>

      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <div
          className="transition-[flex-basis] duration-700 ease-in-out motion-reduce:transition-none"
          style={{ flexBasis: `${pct}%`, background: home.color }}
        />
        <div className="flex-1" style={{ background: away.color }} />
      </div>
    </div>
  );
}
