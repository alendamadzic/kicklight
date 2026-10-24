import type { Rgb, TeamColors } from "../colors";
import type { EventType, Side } from "../model";

// Every effect is a pure function of time: given seconds since it started and the
// colours the strip currently shows, return the colours to show now. The same
// functions drive the Entertainment stream, the virtual strip and the demo page.

export type EffectKey = EventType | "nerves";

export interface EffectContext extends TeamColors {
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

const easeIn = (t: number) => clamp(t) * clamp(t);
const easeOut = (t: number) => 1 - (1 - clamp(t)) * (1 - clamp(t));
/** 0..1 over [start, start + dur]. */
const phase = (t: number, start: number, dur: number) =>
  clamp((t - start) / dur);

/**
 * A soft point of light: 1 at `at`, 0 at `width` away. Keep `width` above ~0.17 for
 * anything that must show: the real strip streams only 7 segments.
 */
const glow = (u: number, at: number, width: number) =>
  clamp(1 - Math.abs(u - at) / width);

/** A ball's tail: bright just behind the head, gone `length` back. `dir` is its heading. */
const trail = (u: number, head: number, length: number, dir: 1 | -1 = 1) => {
  const d = (head - u) * dir;
  return d > 0 ? clamp(1 - d / length) * 0.8 : 0;
};

/**
 * Where the TV's top corners fall along the strip. On a 16:9 set the sides are about
 * half the length of the top, so the top edge runs from a quarter to three quarters.
 */
const TOP_CORNER = 0.75;

/** Fade the scene up from the resting strip at the start and back down to it at the end. */
const bookend = (t: number, durationS: number, out: number) =>
  Math.min(clamp(t / 0.25), clamp((durationS - t) / out));

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
    durationMs: 3000,
    // The flag flutters at the top corner of the TV, the ball is whipped across the
    // top towards the middle, and the box goes up as it lands.
    frame: (t, base, ctx) => {
      const c = teamColor(ctx);
      const k = bookend(t, 3, 0.6);
      const cross = easeOut(phase(t, 1.1, 0.7));
      const ball = TOP_CORNER - 0.3 * cross;
      const flying = t >= 1.1 && t < 1.8;
      const burst = phase(t, 1.8, 0.6);
      return each(base, (b, i, n) => {
        const f = from(i, n, ctx.side);
        let out = scale(b, 0.3);
        if (t < 1.8) {
          const flutter = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 4.5));
          const fade = t < 1.1 ? 1 : 1 - phase(t, 1.1, 0.5);
          out = mix(out, c, glow(f, TOP_CORNER, 0.22) * flutter * fade);
        }
        if (flying) {
          out = mix(out, c, trail(f, ball, 0.3, -1));
          out = mix(out, WHITE, glow(f, ball, 0.14));
        }
        if (t >= 1.8) {
          // Two wavefronts racing out from where the ball dropped.
          const r = burst * 0.45;
          const front = Math.max(
            glow(f, ball - r, 0.14),
            glow(f, ball + r, 0.14),
          );
          out = mix(out, c, front * (1 - burst * 0.6));
          out = mix(out, WHITE, glow(f, ball, 0.18) * (1 - burst));
        }
        return mix(b, out, k);
      });
    },
  },
  free_kick: {
    key: "free_kick",
    label: "Free kick",
    durationMs: 3400,
    // The wall lines up one man at a time, the ball sits and throbs, then it's struck
    // over the wall and the far end lights up.
    frame: (t, base, ctx) => {
      const c = teamColor(ctx);
      const k = bookend(t, 3.4, 0.5);
      const WALL_FROM = 0.56;
      const WALL_TO = 0.76;
      const SPOT = 0.28;
      const built = WALL_FROM + (WALL_TO - WALL_FROM) * phase(t, 0.2, 0.8);
      const strike = easeIn(phase(t, 1.9, 0.5));
      const ball = SPOT + (1.02 - SPOT) * strike;
      const struck = t >= 1.9;
      const landed = phase(t, 2.4, 0.5);
      // The ball breathes faster as the taker steps up.
      const throb =
        0.6 +
        0.4 * Math.abs(Math.sin(t * Math.PI * (1 + phase(t, 1, 0.9) * 3)));
      return each(base, (b, i, n) => {
        const f = from(i, n, ctx.side);
        let out = scale(b, 0.25);
        const inWall = f >= WALL_FROM - 0.06 && f <= built + 0.06;
        if (inWall && t < 2.6) {
          const jitter =
            t > 1 && t < 1.9 ? 0.85 + 0.15 * Math.sin(t * 23 + i) : 1;
          // The wall jumps and drops away once the ball is over it.
          const jumped = struck ? 1 - phase(t, 2.05, 0.4) : 1;
          out = mix(out, WHITE, 0.6 * jitter * jumped);
        }
        if (!struck) out = mix(out, c, glow(f, SPOT, 0.18) * throb);
        else if (t < 2.4) {
          out = mix(out, c, trail(f, ball, 0.35));
          out = mix(out, WHITE, glow(f, ball, 0.15));
        }
        if (t >= 2.4) {
          const near = clamp((f - 0.6) / 0.4);
          out = mix(out, c, near * (1 - landed * 0.5));
          out = mix(out, WHITE, glow(f, 1, 0.25) * (1 - landed));
        }
        return mix(b, out, k);
      });
    },
  },
  offside: {
    key: "offside",
    label: "Offside",
    durationMs: 2400,
    // A runner breaks past the last defender, and the line turns into the linesman's
    // flag, waving yellow and red.
    frame: (t, base, ctx) => {
      const c = teamColor(ctx);
      const k = bookend(t, 2.4, 0.5);
      const LINE = 0.62;
      const run = easeOut(phase(t, 0, 0.9));
      const runner = 0.22 + (0.8 - 0.22) * run;
      const flag = t >= 0.75 && t < 1.9;
      const wave = Math.floor(t * 9);
      return each(base, (b, i, n) => {
        const f = from(i, n, ctx.side);
        let out = scale(b, 0.25);
        const line = glow(f, LINE, 0.16);
        if (flag) {
          const chip = (i + wave) % 2 ? YELLOW : RED;
          out = mix(out, chip, line > 0 ? Math.max(line, 0.7) : 0);
        } else if (t < 0.75) {
          out = mix(out, WHITE, line * 0.75);
        }
        // The runner stops dead when the flag goes up, then fades.
        out = mix(out, c, glow(f, runner, 0.17) * (1 - phase(t, 0.9, 0.7)));
        return mix(b, out, k);
      });
    },
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
    label: "Nerves",
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
  "free_kick",
  "offside",
  "kickoff",
  "full_time",
];
