import type { Rgb } from "@/engine/colors";

/**
 * The strip test: red, amber, green, blue, purple, lit left to right. The real strip
 * (POST /api/hue/test) and the virtual one in setup draw the same pattern, so the
 * viewer can answer "did red light up on the left?" and catch a reversed strip.
 */
export const TEST_COLORS: readonly Rgb[] = [
  [255, 82, 82],
  [255, 181, 71],
  [79, 209, 139],
  [111, 183, 255],
  [181, 140, 255],
];

/** How long each segment waits before the next one lights. */
export const TEST_STEP_MS = 520;

/** Segment (0-4) that point `i` of `n` belongs to. */
export const testSegment = (i: number, n: number) =>
  Math.min(TEST_COLORS.length - 1, Math.floor((i / n) * TEST_COLORS.length));
