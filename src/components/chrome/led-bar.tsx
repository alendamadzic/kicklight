import { cn } from "@/lib/utils";

const AMBER = "var(--amber)";
const OFF = "color-mix(in oklab, var(--muted-foreground) 35%, transparent)";

/**
 * The five-LED strip, the app's one recurring device. It is the logo, the loader
 * (`chase`), setup progress (`progress`), "lights live" (`live`, breathing in kit
 * colours) and a plain marker (`static`). Decorative, so screen readers skip it;
 * pair it with text that says the same thing.
 */
export function LedBar({
  variant = "static",
  colors,
  count = 5,
  step = 0,
  className,
  segmentClassName,
}: {
  variant?: "static" | "chase" | "live" | "progress" | "off";
  /** One colour per segment (or fewer, repeated). Defaults to amber. */
  colors?: readonly string[];
  count?: number;
  /** For `progress`: segments before it are done, it is current. */
  step?: number;
  className?: string;
  segmentClassName?: string;
}) {
  const fill = (i: number) => {
    if (variant === "off") return OFF;
    if (variant === "progress")
      return i < step ? "var(--success)" : i === step ? AMBER : OFF;
    return colors?.length ? colors[i % colors.length] : AMBER;
  };
  const glows = variant !== "off" && variant !== "progress";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 gap-[3px]",
        variant === "chase" && "kl-led-chase",
        variant === "live" && "kl-led-breathe",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => {
        const c = fill(i);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative segments
            key={i}
            className={cn("block h-1.5 w-3.5 rounded-[2px]", segmentClassName)}
            style={{
              background: c,
              boxShadow: glows ? `0 0 8px ${c}` : undefined,
              animationDelay: variant === "chase" ? `${i * 0.18}s` : undefined,
            }}
          />
        );
      })}
    </span>
  );
}
