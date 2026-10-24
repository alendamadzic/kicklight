import Link from "next/link";
import { cn } from "@/lib/utils";

const DOTS = ["#6cabdd", "#6cabdd", "#ffb547", "#c8102e", "#c8102e"];

/** The wordmark with a five-LED strip glyph. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Kicklight home"
      className={cn("inline-flex items-center gap-2.5 outline-none", className)}
    >
      <span aria-hidden className="flex gap-[3px]">
        {DOTS.map((c, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative dots
            key={i}
            className="h-4 w-1.5 rounded-[2px]"
            style={{ background: c, boxShadow: `0 0 8px ${c}88` }}
          />
        ))}
      </span>
      <span className="kl-display text-[1.375rem] leading-none">
        Kick<span className="text-amber">light</span>
      </span>
    </Link>
  );
}
