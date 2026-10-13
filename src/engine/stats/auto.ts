import { STAT_MODES, type StatContext, type StatKey } from "./index";

export type ConcreteStat = Exclude<StatKey, "auto" | "clock">;

export interface AutoState {
  key: ConcreteStat;
  /** When this choice was made, ms since epoch. */
  since: number;
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

  let key: ConcreteStat;
  if (minute >= 80 && diff <= 1) key = "scoreline";
  else if (Math.abs(STAT_MODES.momentum.homeShare(ctx) - 0.5) >= PRESSURE_LEAN)
    key = "momentum";
  else key = "possession";

  if (prev && prev.key !== key && now - prev.since < MIN_DWELL_MS) return prev;
  if (prev && prev.key === key) return prev;
  return { key, since: now };
}
