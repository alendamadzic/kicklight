import { cn } from "@/lib/utils";

/**
 * One line under the TV: each side's value either side of what the lights follow,
 * with a slim bar in the kit colours. Replaces the old donut, which repeated what
 * the strip already shows.
 */
export function SplitReadout({
  label,
  share,
  values,
  home,
  away,
  pending,
  className,
}: {
  /** What the lights follow, e.g. "Possession" or "Auto · Momentum". */
  label: string;
  /** Home share 0..1, or null when unknown. */
  share: number | null;
  values: [string, string] | null;
  home: { short: string; color: string };
  away: { short: string; color: string };
  /** A new stat is on its way; this still shows the old one. */
  pending?: boolean;
  className?: string;
}) {
  const pct = Math.round((share ?? 0.5) * 100);
  const [hv, av] = values ?? [`${pct}%`, `${100 - pct}%`];
  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-300",
        pending && "opacity-50",
        className,
      )}
      aria-busy={pending || undefined}
    >
      <div
        className="flex items-baseline justify-between gap-3"
        role="img"
        aria-label={`${label}: ${home.short} ${hv}, ${away.short} ${av}`}
      >
        <span
          className="kl-display text-[1.75rem] leading-none"
          style={{ color: home.color }}
        >
          {hv}
        </span>
        <span className="truncate text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {pending ? "Switching…" : label}
        </span>
        <span
          className="kl-display text-[1.75rem] leading-none"
          style={{ color: away.color }}
        >
          {av}
        </span>
      </div>
      <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full">
        <span
          className="transition-[width] duration-700 ease-in-out motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: home.color }}
        />
        <span className="flex-1" style={{ background: away.color }} />
      </div>
    </div>
  );
}
