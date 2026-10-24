import type { Route } from "next";
import Link from "next/link";
import { LedBar } from "@/components/chrome/led-bar";
import { cn } from "@/lib/utils";

const DOTS = ["#6cabdd", "#6cabdd", "#ffb547", "#c8102e", "#c8102e"];

/** The wordmark with a five-LED strip glyph. */
export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: Route;
}) {
  return (
    <Link
      href={href}
      aria-label="Kicklight home"
      className={cn("inline-flex items-center gap-2.5 outline-none", className)}
    >
      <LedBar colors={DOTS} segmentClassName="h-4 w-1.5" />
      <span className="kl-display text-[1.375rem] leading-none">
        Kick<span className="text-amber">light</span>
      </span>
    </Link>
  );
}
