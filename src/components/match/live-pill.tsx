import { cn } from "@/lib/utils";

/** A pulsing red dot with an optional LIVE label. */
export function LivePill({
  label = "Live",
  className,
}: {
  label?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="kl-live-dot size-2 rounded-full bg-live" aria-hidden />
      {label ? (
        <span className="kl-display text-xs leading-none text-live">
          {label}
        </span>
      ) : null}
    </span>
  );
}
