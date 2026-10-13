// The 50 Hz frame source for Entertainment streaming. Pure: all time comes in through
// `apply(cmd, now)` and `frame(now)`, so a test (or the demo page) can drive it with a
// fake clock and get the same frames every run.
//
//   resting state   split/fill commands rendered at `channels` points, eased over ~1 s
//   effects         EFFECTS[key].frame(t, base, ctx) for every active effect, in the
//                   order they started, each one's output becoming the next one's base
//   restore         fades everything to black, then `finished(now)` turns true

import type { Rgb } from "@/engine/colors";
import { EFFECTS } from "@/engine/effects";
import type { Side } from "@/engine/model";
import type { Command } from "@/engine/runner";
import { OFF, restingPoints, type StripColors } from "../render";

export interface RendererOptions {
  /** Colours to produce per frame (the entertainment configuration's channel count). */
  channels: number;
  colors: StripColors;
  /** Ease between resting states. Default 1000 ms. */
  easeMs?: number;
  /** Fade-out for `restore`. Default 1500 ms. */
  fadeOutMs?: number;
  /** Who won, for effects that care (full time). */
  winner?: Side | null;
}

export interface Renderer {
  apply(cmd: Command, now: number): void;
  frame(now: number): Rgb[];
  /** True after a `restore` has fully faded and nothing is playing. */
  finished(now: number): boolean;
  /** Effects still playing at `now`, for diagnostics and the virtual strip. */
  activeEffects(now: number): string[];
  setWinner(winner: Side | null): void;
  readonly channels: number;
}

interface Playing {
  key: string;
  startedAt: number;
  side: Side | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

export function createRenderer(opts: RendererOptions): Renderer {
  const n = Math.max(1, Math.round(opts.channels));
  const easeMs = opts.easeMs ?? 1000;
  const fadeMs = opts.fadeOutMs ?? 1500;
  let winner: Side | null = opts.winner ?? null;

  let from: Rgb[] = Array.from({ length: n }, () => OFF);
  let target: Rgb[] = from;
  let easeStart = Number.NEGATIVE_INFINITY;
  let easeLen = easeMs;
  let lit = false;
  let playing: Playing[] = [];
  let restoredAt: number | null = null;

  const resting = (now: number): Rgb[] => {
    const k = smooth(clamp01((now - easeStart) / easeLen));
    if (k >= 1) return target;
    return target.map((c, i) => mix(from[i], c, k));
  };

  const endOf = (p: Playing) => {
    const e = EFFECTS[p.key as keyof typeof EFFECTS];
    return p.startedAt + (e?.durationMs ?? 0);
  };

  const retarget = (next: Rgb[], now: number, ms: number) => {
    // First state snaps in; later ones ease from wherever the strip is right now.
    from = lit ? resting(now) : next;
    target = next;
    easeStart = now;
    easeLen = ms;
    lit = true;
  };

  return {
    channels: n,

    apply(cmd, now) {
      if (cmd.kind === "restore") {
        from = resting(now);
        target = Array.from({ length: n }, () => OFF);
        easeStart = now;
        easeLen = fadeMs;
        restoredAt = now;
        playing = [];
        return;
      }
      if (cmd.kind === "effect") {
        restoredAt = null;
        if (!EFFECTS[cmd.effect]) return;
        // Retire what has already ended so the list stays small.
        playing = playing.filter((p) => endOf(p) > now);
        playing.push({ key: cmd.effect, startedAt: now, side: cmd.side });
        return;
      }
      const pts = restingPoints(cmd, n, opts.colors);
      if (!pts) return;
      restoredAt = null;
      retarget(pts, now, easeMs);
    },

    frame(now) {
      let out = resting(now);
      for (const p of playing) {
        if (now < p.startedAt || now >= endOf(p)) continue;
        const e = EFFECTS[p.key as keyof typeof EFFECTS];
        if (!e) continue;
        out = e.frame((now - p.startedAt) / 1000, out, {
          home: opts.colors.home,
          away: opts.colors.away,
          side: p.side,
          winner,
        });
      }
      return out.map(
        (c) =>
          [
            Math.min(255, Math.max(0, c[0])),
            Math.min(255, Math.max(0, c[1])),
            Math.min(255, Math.max(0, c[2])),
          ] as Rgb,
      );
    },

    finished(now) {
      return (
        restoredAt !== null &&
        now - restoredAt >= fadeMs &&
        playing.every((p) => now >= endOf(p))
      );
    },

    activeEffects(now) {
      return playing
        .filter((p) => now >= p.startedAt && now < endOf(p))
        .map((p) => p.key);
    },

    setWinner(w) {
      winner = w;
    },
  };
}
