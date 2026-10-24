import type { EffectKey } from "@/engine/effects";
import { EFFECTS } from "@/engine/effects";
import type { Side } from "@/engine/model";

/** One row of the "hit the lights" ticker. */
export interface TickerItem {
  id: string;
  effect: EffectKey;
  side: Side | null;
  /** ms since epoch the lights ran it. */
  at: number;
  /** Match minute, when known. Demo rows have it, mirrored rows use `at`. */
  minute?: number | null;
  /** Fired from the event pad rather than the match. */
  pad?: boolean;
}

/** Chip colour per effect, echoing what the strip does. */
export const EFFECT_TINT: Record<string, string> = {
  goal: "#ffffff",
  yellow_card: "#ffce00",
  red_card: "#eb1414",
  penalty_awarded: "#ff9f43",
  penalty_missed: "#8f9bb2",
  var: "#6fb7ff",
  corner: "#4fd18b",
  free_kick: "#4fd18b",
  offside: "#ffce00",
  kickoff: "#4fd18b",
  half_time: "#ffb547",
  full_time: "#ffb547",
  nerves: "#ff5d5d",
};

/** Too frequent to be worth a row, unless fired by hand from the pad. */
const UNLISTED: ReadonlySet<EffectKey> = new Set<EffectKey>([
  "corner",
  "offside",
  "nerves",
]);

export const inTicker = (item: TickerItem): boolean =>
  item.pad || !UNLISTED.has(item.effect);

export const effectLabel = (key: EffectKey): string =>
  EFFECTS[key]?.label ?? key;

/** Effects worth interrupting the viewer for with a toast. */
export const TOAST_EFFECTS: ReadonlySet<EffectKey> = new Set<EffectKey>([
  "goal",
  "red_card",
  "penalty_awarded",
  "penalty_missed",
  "full_time",
]);
