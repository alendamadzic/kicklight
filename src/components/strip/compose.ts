import type { Rgb } from "@/engine/colors";
import { EFFECTS, type EffectKey } from "@/engine/effects";
import type { Side } from "@/engine/model";
import type { Command } from "@/engine/runner";
import type { SessionMirror } from "@/lib/api-types";
import { fillPoints, splitPoints } from "@/lights/render";

/** How many LED points the on-screen strip draws. The real strip has fewer; this is for looks. */
export const STRIP_POINTS = 30;

/** Resting colour when the lights have been handed back: a dim warm white. */
export const DIM: Rgb = [58, 50, 42];

export interface ActiveEffect {
  effect: EffectKey;
  /** ms since epoch the effect started. */
  startedAt: number;
  side: Side | null;
  home: Rgb;
  away: Rgb;
  winner: Side | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function effectDuration(key: EffectKey): number {
  return EFFECTS[key]?.durationMs ?? 0;
}

export function isActive(e: ActiveEffect, now: number): boolean {
  return now >= e.startedAt && now - e.startedAt < effectDuration(e.effect);
}

/**
 * Lay every running effect over the resting colours, oldest first, so a newer
 * effect wins where they overlap. With `reduced` motion the flashing frames are
 * swapped for a single slow tint in the team colour.
 */
export function composeFrame(
  resting: Rgb[],
  effects: readonly ActiveEffect[],
  now: number,
  reduced = false,
): Rgb[] {
  let out = resting;
  for (const e of effects) {
    const fx = EFFECTS[e.effect];
    if (!fx || !isActive(e, now)) continue;
    const t = (now - e.startedAt) / 1000;
    if (reduced) {
      const k = Math.sin(clamp01(t / (fx.durationMs / 1000)) * Math.PI) * 0.55;
      const c = e.side === "away" ? e.away : e.home;
      out = out.map(
        (b) =>
          [
            b[0] + (c[0] - b[0]) * k,
            b[1] + (c[1] - b[1]) * k,
            b[2] + (c[2] - b[2]) * k,
          ] as Rgb,
      );
    } else {
      out = fx.frame(t, out, {
        home: e.home,
        away: e.away,
        side: e.side,
        winner: e.winner,
      });
    }
  }
  return out;
}

export function restingFor(
  cmd: Command | null,
  n: number,
  c: { home: Rgb; away: Rgb },
): Rgb[] {
  if (!cmd || cmd.kind === "restore" || cmd.kind === "effect") {
    return Array.from({ length: n }, () => DIM);
  }
  if (cmd.kind === "split") return splitPoints(cmd.homeShare, n, c);
  return fillPoints(cmd.fraction, cmd.lead, n, c);
}

export function winnerOf(score: { home: number; away: number }): Side | null {
  return score.home > score.away
    ? "home"
    : score.away > score.home
      ? "away"
      : null;
}

export interface MirrorView {
  resting: Rgb[];
  effects: ActiveEffect[];
  /** Latest home share the lights were told to show, if the last resting command was a split. */
  share: number | null;
  /** Latest resting command, if any. */
  resting_cmd: Command | null;
}

/**
 * Rebuild what the strip looks like at `now` from the commands the worker mirrored.
 * Commands scheduled in the future (TV delay) haven't happened yet.
 */
export function resolveMirror(
  m: SessionMirror,
  now: number,
  n = STRIP_POINTS,
): MirrorView {
  const due = m.recent.filter((c) => c.at <= now).sort((a, b) => a.at - b.at);
  let cmd: Command | null = null;
  const effects: ActiveEffect[] = [];
  const winner = winnerOf(m.match.score);
  for (const c of due) {
    if (c.kind === "split" && c.homeShare != null)
      cmd = { kind: "split", homeShare: c.homeShare };
    else if (c.kind === "fill" && c.fraction != null)
      cmd = { kind: "fill", fraction: c.fraction, lead: c.lead ?? null };
    else if (c.kind === "restore") cmd = { kind: "restore" };
    else if (c.kind === "effect" && c.effect) {
      effects.push({
        effect: c.effect,
        startedAt: c.at,
        side: c.side ?? null,
        home: m.colors.home,
        away: m.colors.away,
        winner,
      });
    }
  }
  const share = cmd?.kind === "split" ? cmd.homeShare : null;
  const resting = cmd
    ? restingFor(cmd, n, m.colors)
    : splitPoints(
        m.match.stats.home.possession != null
          ? m.match.stats.home.possession / 100
          : 0.5,
        n,
        m.colors,
      );
  return { resting, effects, share, resting_cmd: cmd };
}

/** The strip colours at `now` for a mirrored session. */
export function frameFromMirror(
  m: SessionMirror,
  now: number,
  n = STRIP_POINTS,
  reduced = false,
): Rgb[] {
  const v = resolveMirror(m, now, n);
  return composeFrame(v.resting, v.effects, now, reduced);
}
