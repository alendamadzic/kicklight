import type { Side } from "../model";
import { STAT_MODES, type StatContext, type StatKey } from "./index";

export type ConcreteStat = Exclude<StatKey, "auto" | "clock">;

/** Why the director picked what it picked, so the remote can say it in words. */
export type AutoReason = "late_close" | "pressure" | "steady";

export interface AutoState {
  key: ConcreteStat;
  /** When this choice was made, ms since epoch. */
  since: number;
  /** Absent on states saved before reasons existed. */
  reason?: AutoReason;
  /** For `pressure`: the side doing the pressing. */
  side?: Side;
}

const MIN_DWELL_MS = 60_000;
/** How far from level momentum has to lean before it takes over. */
const PRESSURE_LEAN = 0.22;

/**
 * Auto-director: possession while it's quiet, momentum when one side is pressing,
 * scoreline in the last ten minutes of a close game. Holds a choice for a minute
 * so the label and the lights don't flip-flop.
 */
export function pickAuto(
  ctx: StatContext,
  prev: AutoState | null,
  now: number,
): AutoState {
  const { snapshot } = ctx;
  const minute = snapshot.minute ?? 0;
  const diff = Math.abs(snapshot.score.home - snapshot.score.away);

  const lean = STAT_MODES.momentum.homeShare(ctx) - 0.5;
  let next: Omit<AutoState, "since">;
  if (minute >= 80 && diff <= 1)
    next = { key: "scoreline", reason: "late_close" };
  else if (Math.abs(lean) >= PRESSURE_LEAN)
    next = {
      key: "momentum",
      reason: "pressure",
      side: lean > 0 ? "home" : "away",
    };
  else next = { key: "possession", reason: "steady" };

  if (prev && prev.key !== next.key && now - prev.since < MIN_DWELL_MS)
    return prev;
  // Same pick: keep when it started, but refresh the reason (the pressing side can change).
  if (prev && prev.key === next.key) return { ...next, since: prev.since };
  return { ...next, since: now };
}
