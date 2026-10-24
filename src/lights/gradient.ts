import type { Rgb } from "@/engine/colors";

// Helpers shared by every transport that writes a gradient to a real strip.

/** Nearest-neighbour resample so blocks of colour stay crisp (no blending between teams). */
export function resampleNearest<T>(items: readonly T[], n: number): T[] {
  if (items.length === 0 || n <= 0) return [];
  if (items.length === n) return items.slice();
  return Array.from(
    { length: n },
    (_, j) =>
      items[
        Math.min(items.length - 1, Math.floor(((j + 0.5) * items.length) / n))
      ],
  );
}

/**
 * Overall brightness for a set of colours. The bridge has one dimmer per light, not per
 * point, so it follows the brightest point: a uniform dim (the nerves pulse) then shows
 * instead of collapsing to the same xy at full brightness.
 */
export function brightnessFor(colors: readonly Rgb[], master = 100): number {
  const peak = colors.reduce((m, c) => Math.max(m, c[0], c[1], c[2]), 0);
  return Math.min(100, Math.max(1, Math.round((peak / 255) * master)));
}
