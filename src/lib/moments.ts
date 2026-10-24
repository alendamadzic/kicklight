import type { EffectKey } from "@/engine/effects";
import type { EventType, Side } from "@/engine/model";

/** The moments worth a marker on the timeline and a "next moment" jump. */
export const MARKED: ReadonlySet<EffectKey> = new Set<EffectKey>([
  "goal",
  "own_goal",
  "penalty_awarded",
  "penalty_missed",
  "yellow_card",
  "red_card",
  "var",
]);

export interface TimelineMarker {
  id: string;
  effect: EffectKey;
  side: Side | null;
  minute: number;
  /** Position along the bar, 0..1. */
  at: number;
}

/**
 * Markers for a 0..end timeline from anything with a minute (ticker rows, script
 * events). Rows without a minute, or that aren't marked moments, are left out.
 * Oldest first, so later markers draw on top.
 */
export function timelineMarkers(
  items: readonly {
    id: string;
    effect: EffectKey;
    side: Side | null;
    minute?: number | null;
  }[],
  end = 90,
): TimelineMarker[] {
  const span = Math.max(1, end);
  return items
    .filter(
      (i): i is typeof i & { minute: number } =>
        i.minute != null && MARKED.has(i.effect),
    )
    .map((i) => ({
      id: i.id,
      effect: i.effect,
      side: i.side,
      minute: i.minute,
      at: Math.min(1, Math.max(0, i.minute / span)),
    }))
    .sort((a, b) => a.minute - b.minute);
}

/** The timeline's length: 90, or longer once the match runs into added or extra time. */
export const timelineEnd = (minute: number | null | undefined) =>
  Math.max(90, Math.ceil(minute ?? 0));

/** How far before a moment a "next moment" jump lands, so you see the build-up. */
const LEAD_MINUTES = 0.75;

/**
 * Where "Next moment" should seek to: just before the next marked event after
 * `minute`, or null when there's none left.
 */
export function nextMomentMinute(
  events: readonly { minute: number; type: EventType }[],
  minute: number,
): number | null {
  const next = events
    .filter((e) => MARKED.has(e.type) && e.minute > minute + LEAD_MINUTES)
    .reduce<number | null>(
      (best, e) => (best == null || e.minute < best ? e.minute : best),
      null,
    );
  return next == null ? null : Math.max(0, next - LEAD_MINUTES);
}

/** The next marked event itself, for the button label ("34' card"). */
export function nextMoment<T extends { minute: number; type: EventType }>(
  events: readonly T[],
  minute: number,
): T | null {
  return (
    events
      .filter((e) => MARKED.has(e.type) && e.minute > minute + LEAD_MINUTES)
      .sort((a, b) => a.minute - b.minute)[0] ?? null
  );
}
