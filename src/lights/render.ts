import type { Rgb } from "@/engine/colors";
import type { Command } from "@/engine/runner";

// Turns a semantic command ("home gets 62%") into the concrete colour points a
// strip can show. Pure, so the same code backs the bridge, the virtual strip and tests.

export interface StripColors {
  home: Rgb;
  away: Rgb;
}

const OFF: Rgb = [0, 0, 0];

/**
 * Colour for each of `points` evenly spaced gradient points. At least one point
 * always goes to a team that has any share, so a 5% share still shows on the strip.
 */
export function splitPoints(
  homeShare: number,
  points: number,
  c: StripColors,
): Rgb[] {
  const share = Math.min(1, Math.max(0, homeShare));
  let home = Math.round(share * points);
  if (share > 0 && home === 0) home = 1;
  if (share < 1 && home === points) home = points - 1;
  return Array.from({ length: points }, (_, i) => (i < home ? c.home : c.away));
}

/** The clock fill: the leader's colour grows from the home end, the rest stays dim. */
export function fillPoints(
  fraction: number,
  lead: "home" | "away" | null,
  points: number,
  c: StripColors,
): Rgb[] {
  const lit = Math.max(0, Math.min(points, Math.round(fraction * points)));
  const colour: Rgb =
    lead === "home" ? c.home : lead === "away" ? c.away : [255, 244, 230];
  const dim: Rgb = [colour[0] * 0.06, colour[1] * 0.06, colour[2] * 0.06];
  return Array.from({ length: points }, (_, i) => (i < lit ? colour : dim));
}

/** Colours for a steady-state command; null for commands that aren't a resting state. */
export function restingPoints(
  cmd: Command,
  points: number,
  c: StripColors,
): Rgb[] | null {
  if (cmd.kind === "split") return splitPoints(cmd.homeShare, points, c);
  if (cmd.kind === "fill") return fillPoints(cmd.fraction, cmd.lead, points, c);
  return null;
}

export { OFF };
