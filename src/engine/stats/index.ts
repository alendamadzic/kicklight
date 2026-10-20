import type { MatchEvent, MatchSnapshot, SideStats } from "../model";

export type StatKey =
  | "possession"
  | "momentum"
  | "dominance"
  | "scoreline"
  | "shots"
  | "onTarget"
  | "corners"
  | "discipline"
  | "clock"
  | "auto";

export interface StatContext {
  snapshot: MatchSnapshot;
  /** All events so far, any order. */
  events: MatchEvent[];
}

export interface StatMode {
  key: StatKey;
  label: string;
  /** Share of the strip the home team gets, 0..1. */
  homeShare: (ctx: StatContext) => number;
  /** Optional human values for the readout, e.g. ["58%", "42%"]. */
  values?: (ctx: StatContext) => [string, string];
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Home share of a pair of counts; 0.5 when both are zero. */
export function share(home: number, away: number): number {
  const total = home + away;
  return total === 0 ? 0.5 : home / total;
}

function possession({ snapshot }: StatContext): number {
  const p = snapshot.stats.home.possession;
  const a = snapshot.stats.away.possession;
  if (p != null) return clamp(p / 100, 0, 1);
  if (a != null) return clamp(1 - a / 100, 0, 1);
  return 0.5;
}

const MOMENTUM_WINDOW_MIN = 10;
const MOMENTUM_WEIGHTS: Partial<Record<MatchEvent["type"], number>> = {
  goal: 4,
  own_goal: 4,
  penalty_awarded: 3,
  penalty_missed: 2,
  shot_on_target: 2,
  shot: 1,
  corner: 1,
  free_kick: 1,
};

/** Recent attacking pressure, decaying linearly over the last ten match minutes. */
function momentum(ctx: StatContext): number {
  const now = ctx.snapshot.minute ?? 0;
  let home = 0;
  let away = 0;
  for (const e of ctx.events) {
    if (!e.side) continue;
    const w = MOMENTUM_WEIGHTS[e.type];
    if (!w) continue;
    const age = now - e.minute;
    if (age < 0 || age > MOMENTUM_WINDOW_MIN) continue;
    const decayed = w * (1 - age / MOMENTUM_WINDOW_MIN);
    // An own goal helps the opposition.
    const credited =
      e.type === "own_goal" ? (e.side === "home" ? "away" : "home") : e.side;
    if (credited === "home") home += decayed;
    else away += decayed;
  }
  // Possession nudges it so a quiet spell still leans somewhere.
  const lean = (possession(ctx) - 0.5) * 2;
  home += Math.max(0, lean) * 1.5;
  away += Math.max(0, -lean) * 1.5;
  return clamp(0.5 + ((home - away) / (home + away + 4)) * 0.5, 0.08, 0.92);
}

function dominance(ctx: StatContext): number {
  const { home, away } = ctx.snapshot.stats;
  return clamp(
    0.4 * possession(ctx) +
      0.3 * share(home.shotsOnTarget, away.shotsOnTarget) +
      0.2 * share(home.shots, away.shots) +
      0.1 * share(home.corners, away.corners),
    0,
    1,
  );
}

/** A level game is 50/50; each goal of lead adds 15 points to the leader, capped 90/10. */
function scoreline({ snapshot }: StatContext): number {
  return clamp(
    0.5 + (snapshot.score.home - snapshot.score.away) * 0.15,
    0.1,
    0.9,
  );
}

function disciplineLoad(s: SideStats): number {
  return s.fouls + 3 * s.yellowCards + 8 * s.redCards;
}

/** Whoever is being penalised more gets less of the strip. */
function discipline({ snapshot }: StatContext): number {
  return share(
    disciplineLoad(snapshot.stats.away),
    disciplineLoad(snapshot.stats.home),
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const STAT_MODES: Record<
  Exclude<StatKey, "auto" | "clock">,
  StatMode
> = {
  possession: {
    key: "possession",
    label: "Possession",
    homeShare: possession,
    values: (c) => {
      const p = possession(c);
      return [pct(p), pct(1 - p)];
    },
  },
  momentum: { key: "momentum", label: "Momentum", homeShare: momentum },
  dominance: { key: "dominance", label: "Dominance", homeShare: dominance },
  scoreline: {
    key: "scoreline",
    label: "Scoreline",
    homeShare: scoreline,
    values: ({ snapshot }) => [
      String(snapshot.score.home),
      String(snapshot.score.away),
    ],
  },
  shots: {
    key: "shots",
    label: "Shots",
    homeShare: ({ snapshot }) =>
      share(snapshot.stats.home.shots, snapshot.stats.away.shots),
    values: ({ snapshot }) => [
      String(snapshot.stats.home.shots),
      String(snapshot.stats.away.shots),
    ],
  },
  onTarget: {
    key: "onTarget",
    label: "On target",
    homeShare: ({ snapshot }) =>
      share(
        snapshot.stats.home.shotsOnTarget,
        snapshot.stats.away.shotsOnTarget,
      ),
    values: ({ snapshot }) => [
      String(snapshot.stats.home.shotsOnTarget),
      String(snapshot.stats.away.shotsOnTarget),
    ],
  },
  corners: {
    key: "corners",
    label: "Corners",
    homeShare: ({ snapshot }) =>
      share(snapshot.stats.home.corners, snapshot.stats.away.corners),
    values: ({ snapshot }) => [
      String(snapshot.stats.home.corners),
      String(snapshot.stats.away.corners),
    ],
  },
  discipline: { key: "discipline", label: "Discipline", homeShare: discipline },
};

/** The curated list shown in the UI, in display order. */
export const STAT_ORDER: StatKey[] = [
  "possession",
  "momentum",
  "dominance",
  "scoreline",
  "shots",
  "onTarget",
  "corners",
  "discipline",
];

export function homeShareFor(
  key: Exclude<StatKey, "auto" | "clock">,
  ctx: StatContext,
): number {
  return STAT_MODES[key].homeShare(ctx);
}
