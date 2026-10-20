import { EFFECTS, type EffectKey } from "./effects";
import type { MatchEvent, MatchPhase, MatchSnapshot, Side } from "./model";
import { type Scheduled, schedule, takeDue } from "./scheduler";
import { STAT_MODES, type StatKey } from "./stats";
import { type AutoState, type ConcreteStat, pickAuto } from "./stats/auto";

// The runner is the whole brain: feed in a snapshot and events, get back what the
// lights should do and when. It is pure (state in, state out), so the cloud tick,
// the local loop and the demo page all run exactly this code.

export type Command =
  | { kind: "split"; homeShare: number }
  | { kind: "fill"; fraction: number; lead: Side | null }
  | { kind: "effect"; effect: EffectKey; side: Side | null; minute?: number }
  | { kind: "restore" };

export interface RunnerState {
  seen: string[];
  stat: StatKey;
  auto: AutoState | null;
  pending: Scheduled<Command>[];
  lastShare: number | null;
  lastFill: number | null;
  nervesNext: number;
  finished: boolean;
  started: boolean;
  lastPhase: MatchPhase | null;
  /** The viewer's choice as of the last tick, to spot a switch. */
  appliedStat: StatKey | null;
  /** The concrete stat currently on the strip. */
  shown: ConcreteStat | "clock" | null;
}

export interface TickInput {
  snapshot: MatchSnapshot;
  events: MatchEvent[];
  /** ms since epoch. */
  now: number;
  /** The viewer's TV delay. */
  delayMs: number;
  /** Return commands due up to now + horizon so a caller can sleep until each `at`. */
  horizonMs?: number;
}

export interface TickResult {
  state: RunnerState;
  /** Commands due within the horizon, in order. `at` is when to run each one. */
  commands: Scheduled<Command>[];
  /** The stat actually driving the lights (resolves "auto"). */
  activeStat: StatKey;
}

/** On the first tick, events that landed on TV longer ago than this are history, not news. */
const STALE_MS = 15_000;
/**
 * Once running, a new event is news even if it's old by its wallclock: ESPN often publishes
 * key events (goals included) 30-90s after they happen. Only a feed backfill this late is skipped.
 */
const FEED_LAG_MS = 180_000;
/** After the final whistle, hold the colours this long before handing the lights back. */
const FULL_TIME_HOLD_MS = 30_000;
const NERVES_MS = 4_000;

export function initialState(stat: StatKey = "possession"): RunnerState {
  return {
    seen: [],
    stat,
    auto: null,
    pending: [],
    lastShare: null,
    lastFill: null,
    nervesNext: 0,
    finished: false,
    started: false,
    lastPhase: null,
    appliedStat: null,
    shown: null,
  };
}

/** Map a feed event to the effect it should trigger, and which side's colour it uses. */
function effectFor(
  e: MatchEvent,
): { effect: EffectKey; side: Side | null } | null {
  if (e.type === "own_goal") {
    const beneficiary: Side | null =
      e.side === "home" ? "away" : e.side === "away" ? "home" : null;
    return { effect: "goal", side: beneficiary };
  }
  if (e.type === "var_overturned" || e.type === "second_half") return null;
  if (!EFFECTS[e.type]) return null;
  return { effect: e.type, side: e.side };
}

export function tick(prev: RunnerState, input: TickInput): TickResult {
  const { snapshot, events, now, delayMs, horizonMs = 0 } = input;
  let state: RunnerState = { ...prev, seen: [...prev.seen] };
  const seen = new Set(state.seen);
  let pending = state.pending;
  const maxAge = prev.started ? FEED_LAG_MS : STALE_MS;

  // 1. New events → effects at wallclock + delay, or now if the feed was late with them.
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const at = e.wallclock + delayMs;
    if (at < now - maxAge) continue;
    const fx = effectFor(e);
    if (!fx) continue;
    pending = schedule(pending, Math.max(at, now), {
      kind: "effect",
      ...fx,
      minute: e.minute,
    });
  }

  const live = snapshot.phase !== "scheduled" && snapshot.phase !== "suspended";

  // 2. Resolve which stat drives the strip.
  const ctx = { snapshot, events };
  let concrete: ConcreteStat | "clock";
  if (state.stat === "auto") {
    state.auto = pickAuto(ctx, state.auto, now);
    concrete = state.auto.key;
  } else {
    concrete = state.stat as ConcreteStat | "clock";
  }

  // 3. A new stat always re-sends. The viewer switching channels is a control, not match
  // news, so it lands now and drops the old stat's splits still queued behind the delay.
  const userSwitched =
    state.appliedStat != null && state.appliedStat !== state.stat;
  if (concrete !== state.shown) {
    state.lastShare = null;
    state.lastFill = null;
  }
  if (userSwitched) {
    pending = pending.filter(
      (q) => q.item.kind !== "split" && q.item.kind !== "fill",
    );
  }

  // 4. Stat drift → a split (or clock fill) at now + delay, only when it moved a point.
  if (live && snapshot.phase !== "full_time") {
    const at = userSwitched ? now : now + delayMs;
    if (concrete === "clock") {
      const fraction = Math.min(1, Math.max(0, (snapshot.minute ?? 0) / 90));
      const rounded = Math.round(fraction * 100) / 100;
      if (
        state.lastFill == null ||
        Math.abs(rounded - state.lastFill) >= 0.01
      ) {
        const lead: Side | null =
          snapshot.score.home > snapshot.score.away
            ? "home"
            : snapshot.score.away > snapshot.score.home
              ? "away"
              : null;
        pending = schedule(pending, at, {
          kind: "fill",
          fraction: rounded,
          lead,
        });
        state.lastFill = rounded;
      }
    } else {
      const share = STAT_MODES[concrete].homeShare(ctx);
      const rounded = Math.round(share * 100) / 100;
      if (
        state.lastShare == null ||
        Math.abs(rounded - state.lastShare) >= 0.01
      ) {
        pending = schedule(pending, at, { kind: "split", homeShare: rounded });
        state.lastShare = rounded;
      }
    }
  }

  // 5. Squeaky bum time: stoppage time of a one-goal game.
  const oneGoal = Math.abs(snapshot.score.home - snapshot.score.away) === 1;
  if (
    oneGoal &&
    (snapshot.phase === "second_half" || snapshot.phase === "extra_time") &&
    (snapshot.minute ?? 0) >= 90
  ) {
    let t = Math.max(state.nervesNext, now + delayMs);
    const until = now + delayMs + 10_000;
    while (t < until) {
      pending = schedule(pending, t, {
        kind: "effect",
        effect: "nerves",
        side: null,
        minute: snapshot.minute ?? 90,
      });
      t += NERVES_MS;
    }
    state.nervesNext = t;
  }

  // 6. Final whistle → hold, then hand the lights back.
  if (snapshot.phase === "full_time" && !state.finished) {
    state.finished = true;
    pending = schedule(pending, now + delayMs + FULL_TIME_HOLD_MS, {
      kind: "restore",
    });
  }

  const { due, rest } = takeDue(pending, now + horizonMs);
  state = {
    ...state,
    seen: [...seen],
    pending: rest,
    started: true,
    lastPhase: snapshot.phase,
    appliedStat: state.stat,
    shown: concrete,
  };
  return { state, commands: due, activeStat: concrete };
}
