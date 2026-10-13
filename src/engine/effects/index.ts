import { luminance, type Rgb } from "../colors";
import type { EventType, Side } from "../model";

// Every effect is a pure function of time: given seconds since it started and the
// colours the strip currently shows, return the colours to show now. The same
// functions drive the Entertainment stream, the virtual strip and the demo page.

export type EffectKey = EventType | "nerves";

export interface EffectContext {
  home: Rgb;
  away: Rgb;
  /** Side the event belongs to; null for match-level events. */
  side: Side | null;
  /** Who is ahead at full time, null if level. */
  winner: Side | null;
}

/** What the bridge can do natively when we can't stream frames (cloud mode). */
export interface SignalFallback {
  signal: "on_off_color" | "alternating";
  durationMs: number;
  colors: Rgb[];
}

export interface Effect {
  key: EffectKey;
  label: string;
  durationMs: number;
  /** Colours at time `t` (seconds). `base` is the resting strip and is never mutated. */
  frame: (t: number, base: Rgb[], ctx: EffectContext) => Rgb[];
  signal?: (ctx: EffectContext) => SignalFallback;
}

const WHITE: Rgb = [255, 244, 230];
const YELLOW: Rgb = [255, 206, 0];
const RED: Rgb = [235, 20, 20];
const WARM: Rgb = [255, 180, 90];

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (a: Rgb, k: number): Rgb => [
  Math.min(255, a[0] * k),
  Math.min(255, a[1] * k),
  Math.min(255, a[2] * k),
];
const teamColor = (ctx: EffectContext): Rgb =>
  ctx.side === "away" ? ctx.away : ctx.home;

/** Strip position 0..1 where 0 is the home end. The attacking side's own end is the "from" end. */
const from = (i: number, n: number, side: Side | null) => {
  const u = n > 1 ? i / (n - 1) : 0;
  return side === "away" ? 1 - u : u;
};

const each = (base: Rgb[], fn: (c: Rgb, i: number, n: number) => Rgb): Rgb[] =>
  base.map((c, i) => fn(c, i, base.length));

export const EFFECTS: Partial<Record<EffectKey, Effect>> = {
  goal: {
    key: "goal",
    label: "Goal",
    durationMs: 6500,
    // Strobe outward from the centre, three full floods, then ease back.
    frame: (t, base, ctx) => {
      const c = teamColor(ctx);
      return each(base, (b, i, n) => {
        const d = Math.abs(n > 1 ? i / (n - 1) - 0.5 : 0) * 2;
        if (t < 1.4) {
          const lit = d < t / 1.0;
          if (!lit) return scale(b, 0.25);
          const strobe = Math.floor(t * 7) % 2 ? 1 : 0.35;
          return scale(mix(c, WHITE, strobe > 0.9 ? 0.35 : 0), strobe);
        }
        if (t < 5.2)
          return scale(
            c,
            0.55 + 0.45 * Math.cos(((t - 1.4) * Math.PI * 2) / 1.25),
          );
        return mix(c, b, clamp((t - 5.2) / 1.3));
      });
    },
    signal: (ctx) => ({
      signal: "alternating",
      durationMs: 5000,
      colors: [teamColor(ctx), WHITE],
    }),
  },
  yellow_card: {
    key: "yellow_card",
    label: "Yellow card",
    durationMs: 2400,
    frame: (t, base) => {
      const k = clamp(Math.sin(Math.min(t, 2) * Math.PI * 2));
      return each(base, (b) => mix(b, YELLOW, k));
    },
    signal: () => ({
      signal: "on_off_color",
      durationMs: 2000,
      colors: [YELLOW],
    }),
  },
  red_card: {
    key: "red_card",
    label: "Red card",
    durationMs: 5500,
    // Yellow flicker, red pours in from the sinner's end, holds, drains away.
    frame: (t, base, ctx) =>
      each(base, (b, i, n) => {
        const f = from(i, n, ctx.side);
        if (t < 0.6) return mix(b, YELLOW, Math.floor(t * 10) % 2 ? 0.6 : 0.2);
        if (t < 2) return f < (t - 0.6) / 1.2 ? RED : scale(b, 0.4);
        if (t < 4.2) return scale(RED, 0.75 + 0.25 * Math.sin(t * 3));
        return mix(RED, b, clamp((t - 4.2) / 1.3));
      }),
    signal: () => ({ signal: "on_off_color", durationMs: 4000, colors: [RED] }),
  },
  penalty_awarded: {
    key: "penalty_awarded",
    label: "Penalty",
    durationMs: 6000,
    // A heartbeat in the taker's colour.
    frame: (t, base, ctx) => {
      const p = t % 1.1;
      const k =
        p < 0.12
          ? p / 0.12
          : p < 0.24
            ? 1 - ((p - 0.12) / 0.12) * 0.6
            : p < 0.36
              ? 0.4 + ((p - 0.24) / 0.12) * 0.6
              : Math.max(0.15, 1 - (p - 0.36) / 0.5);
      const c = teamColor(ctx);
      return each(base, () => scale(c, 0.15 + 0.85 * k));
    },
    signal: (ctx) => ({
      signal: "on_off_color",
      durationMs: 3000,
      colors: [teamColor(ctx)],
    }),
  },
  penalty_missed: {
    key: "penalty_missed",
    label: "Penalty missed",
    durationMs: 3000,
    // The colour collapses inward and goes dark, then recovers.
    frame: (t, base, ctx) => {
      const c = teamColor(ctx);
      return each(base, (b, i, n) => {
        const d = Math.abs(n > 1 ? i / (n - 1) - 0.5 : 0) * 2;
        const f = clamp(t / 1.2);
        const dark = scale(b, 0.08);
        const col = d > 1 - f ? dark : scale(c, 0.9);
        return t > 1.4 ? mix(dark, b, clamp((t - 1.6) / 1.4)) : col;
      });
    },
  },
  var: {
    key: "var",
    label: "VAR check",
    durationMs: 5000,
    // Dim strip with a white scan bar sweeping back and forth.
    frame: (t, base) => {
      const pos = (Math.sin(t * 2.4 - Math.PI / 2) + 1) / 2;
      return each(base, (b, i, n) => {
        const u = n > 1 ? i / (n - 1) : 0;
        return mix(
          scale(b, 0.18),
          WHITE,
          Math.max(0, 1 - Math.abs(u - pos) * 9),
        );
      });
    },
  },
  corner: {
    key: "corner",
    label: "Corner",
    durationMs: 2000,
    // The two top corners of the TV flash in the team's colour.
    frame: (t, base, ctx) => {
      const k = Math.max(0, Math.sin(t * Math.PI * 3));
      const c = teamColor(ctx).map((v) => Math.min(255, v * 1.2)) as Rgb;
      return each(base, (b, i, n) => {
        const u = n > 1 ? i / (n - 1) : 0;
        return Math.abs(u - 1 / 3) < 0.07 || Math.abs(u - 2 / 3) < 0.07
          ? mix(b, c, k)
          : b;
      });
    },
  },
  shot_on_target: {
    key: "shot_on_target",
    label: "Shot on target",
    durationMs: 1600,
    // A quick ripple from the attacking end towards goal.
    frame: (t, base, ctx) =>
      each(base, (b, i, n) =>
        mix(
          b,
          WHITE,
          Math.max(0, 1 - Math.abs(from(i, n, ctx.side) - t / 1.1) * 7) * 0.85,
        ),
      ),
  },
  shot: {
    key: "shot",
    label: "Shot off target",
    durationMs: 1000,
    frame: (t, base, ctx) =>
      each(base, (b, i, n) =>
        from(i, n, ctx.side) < 0.5
          ? scale(b, 1 + 0.4 * Math.sin(t * Math.PI))
          : b,
      ),
  },
  foul: {
    key: "foul",
    label: "Foul",
    durationMs: 800,
    frame: (t, base, ctx) =>
      each(base, (b, i, n) =>
        from(i, n, ctx.side) < 0.5
          ? scale(b, 1 - 0.6 * Math.sin((t / 0.8) * Math.PI))
          : b,
      ),
  },
  substitution: {
    key: "substitution",
    label: "Substitution",
    durationMs: 2000,
    frame: (t, base, ctx) =>
      each(base, (b, i, n) =>
        from(i, n, ctx.side) < 0.5
          ? scale(b, 0.5 + 0.5 * Math.cos((t / 2) * Math.PI * 2))
          : b,
      ),
  },
  kickoff: {
    key: "kickoff",
    label: "Kick-off",
    durationMs: 2600,
    // Both colours sweep in from the ends and meet in the middle.
    frame: (t, base) => {
      const f = clamp(t / 1.6) * 0.5;
      return each(base, (b, i, n) => {
        const u = n > 1 ? i / (n - 1) : 0;
        return Math.min(u, 1 - u) > f ? scale(b, 0.06) : b;
      });
    },
  },
  half_time: {
    key: "half_time",
    label: "Half time",
    durationMs: 4000,
    // Fade to a warm 45% white: kettle-and-snacks lighting.
    frame: (t, base) => {
      const k = clamp(t / 1.2) * (t > 3.2 ? 1 - (t - 3.2) / 0.8 : 1);
      return each(base, (b) => mix(b, scale(WARM, 0.45), k));
    },
  },
  full_time: {
    key: "full_time",
    label: "Full time",
    durationMs: 6000,
    // The winner's colour floods and sparkles; a draw alternates both colours.
    frame: (t, base, ctx) =>
      each(base, (_, i) => {
        const c =
          ctx.winner === "home"
            ? ctx.home
            : ctx.winner === "away"
              ? ctx.away
              : i % 2
                ? ctx.home
                : ctx.away;
        const s = 0.7 + 0.3 * Math.sin(t * 9 + i * 1.7);
        return scale(c, s * (t > 5 ? 1 - (t - 5) : 1));
      }),
  },
  nerves: {
    key: "nerves",
    label: "Squeaky bum time",
    durationMs: 4000,
    // One slow breath; the runner re-issues it while the situation lasts.
    frame: (t, base) => {
      const k = 0.75 + 0.25 * Math.cos((t / 4) * Math.PI * 2);
      return each(base, (b) => scale(b, k));
    },
  },
};

/** Effects the demo's event pad exposes, in display order. */
export const PAD_ORDER: EffectKey[] = [
  "goal",
  "yellow_card",
  "red_card",
  "penalty_awarded",
  "penalty_missed",
  "var",
  "corner",
  "shot_on_target",
  "foul",
  "substitution",
  "kickoff",
  "full_time",
];

/** Dimmest a lit LED may go before we'd rather turn the channel off. */
export const isVisible = (c: Rgb) => luminance(c) > 6;

export function getEffect(key: EffectKey): Effect | undefined {
  return EFFECTS[key];
}
