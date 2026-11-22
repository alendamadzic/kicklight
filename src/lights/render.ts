import type { Rgb, TeamColors } from "@/engine/colors";
import type { Side } from "@/engine/model";
import type { Command } from "@/engine/runner";

// Turns a semantic command ("home gets 62%") into the concrete colour points a
// strip can show. Pure, so the same code backs the bridge, the virtual strip and tests.

export const OFF: Rgb = [0, 0, 0];

/**
 * The halfway line: the centre point of an odd-length strip when the split is even.
 * A soft warm white, because over the Hue REST API a point has a colour but no
 * brightness of its own, so a "dark" point would glow white at full strength anyway.
 */
export const HALFWAY: Rgb = [110, 98, 84];

/** Gradient points on most Hue gradient strips (`points_capable`). */
const TYPICAL_STRIP_POINTS = 5;

/**
 * Whether the split shows the halfway line. On an odd strip that's while the line is
 * the nearest fit: the break within a quarter-point of the middle (any further out, a
 * whole point to one side is closer). An even strip can split 50/50 exactly, but the
 * virtual strip (30 LEDs) draws the line over the same range a typical 5-point strip
 * does, so the phone shows what the TV shows.
 */
function isEvenSplit(share: number, points: number): boolean {
  const odd = points % 2 === 1;
  // A short even strip already splits exactly; two centre points would be most of it.
  if (!odd && points < 2 * TYPICAL_STRIP_POINTS) return false;
  const band = odd ? 0.25 / points : 0.25 / TYPICAL_STRIP_POINTS;
  return Math.abs(share - 0.5) <= band + 1e-9;
}

/**
 * Colour for each of `points` evenly spaced gradient points. At least one point
 * always goes to a team that has any share, so a 5% share still shows on the strip.
 *
 * Real strips take 5 or 7 points, so an even split can't fall between two of them:
 * rounding would hand the centre point to home and push the break a whole half-point
 * right. When the break lands inside the centre point it becomes the halfway line
 * instead, so 50/50 reads as 2 · line · 2 (on 5 points, from 45% to 55%).
 */
export function splitPoints(
  homeShare: number,
  points: number,
  c: TeamColors,
): Rgb[] {
  const share = Math.min(1, Math.max(0, homeShare));
  if (points >= 3 && isEvenSplit(share, points)) {
    // One centre point on an odd strip; the two either side of the middle on an even one.
    const lo = Math.floor((points - 1) / 2);
    const hi = Math.ceil((points - 1) / 2);
    return Array.from({ length: points }, (_, i) =>
      i < lo ? c.home : i > hi ? c.away : HALFWAY,
    );
  }
  let home = Math.round(share * points);
  if (share > 0 && home === 0) home = 1;
  if (share < 1 && home === points) home = points - 1;
  return Array.from({ length: points }, (_, i) => (i < home ? c.home : c.away));
}

/** The clock fill: the leader's colour grows from the home end, the rest stays dim. */
export function fillPoints(
  fraction: number,
  lead: Side | null,
  points: number,
  c: TeamColors,
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
  c: TeamColors,
): Rgb[] | null {
  if (cmd.kind === "split") return splitPoints(cmd.homeShare, points, c);
  if (cmd.kind === "fill") return fillPoints(cmd.fraction, cmd.lead, points, c);
  return null;
}

/** A command as remembered in a session's history (see `MirroredCommand`). */
export interface RecordedCommand {
  kind: Command["kind"];
  homeShare?: number;
  fraction?: number;
  lead?: Side | null;
}

/** What the strip rests on between effects: the last recorded split or fill, else an even split. */
export function restingFromRecent(
  recent: readonly RecordedCommand[],
  points: number,
  c: TeamColors,
): Rgb[] {
  const last = recent.findLast((m) => m.kind === "split" || m.kind === "fill");
  return last?.kind === "fill"
    ? fillPoints(last.fraction ?? 0, last.lead ?? null, points, c)
    : splitPoints(last?.homeShare ?? 0.5, points, c);
}
