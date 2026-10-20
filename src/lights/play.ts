import type { Rgb } from "@/engine/colors";
import type { Effect, EffectContext } from "@/engine/effects";
import type { LightTransport } from "./transport";

// Plays an effect on a strip that can't stream: samples the effect's own frames a few
// times a second and eases between them with REST gradient writes, then settles back
// on the resting strip. Coarser than the 50 Hz stream, but the same animation.

/** ~3 writes a second keeps well inside the Hue API's per-light rate limit. */
const STEP_MS = 330;

/**
 * Sub-samples per gradient point. Effects are drawn at about the virtual strip's 30 LEDs
 * and averaged down, so a travelling ball or a thin scan bar still shows on 5 points
 * instead of falling between them.
 */
const DETAIL = 6;

/** One frame drawn at `DETAIL`× the strip's resolution, then averaged back to `base.length`. */
export function sampleFrame(
  fx: Effect,
  t: number,
  base: Rgb[],
  ctx: EffectContext,
): Rgb[] {
  const fine = base.flatMap((c) => Array.from({ length: DETAIL }, () => c));
  const out = fx.frame(t, fine, ctx);
  return base.map((_, i) => {
    const sum = [0, 0, 0];
    for (let j = i * DETAIL; j < (i + 1) * DETAIL; j++) {
      for (let k = 0; k < 3; k++) sum[k] += out[j][k];
    }
    const avg = (v: number) => Math.min(255, Math.max(0, v / DETAIL));
    return [avg(sum[0]), avg(sum[1]), avg(sum[2])] as Rgb;
  });
}

/**
 * Play `fx` over `base`, starting `fromMs` into it, so an effect that is picked up late
 * stays in step with the virtual strip instead of running behind it.
 */
export async function playFrames(
  transport: LightTransport,
  fx: Effect,
  ctx: EffectContext,
  base: Rgb[],
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
  fromMs = 0,
): Promise<void> {
  if (fromMs >= fx.durationMs) return;
  for (let ms = Math.max(0, fromMs); ms < fx.durationMs; ms += STEP_MS) {
    // Aim each write at the frame it will land on, so the eases line up with the animation.
    await transport.setGradient(
      sampleFrame(fx, (ms + STEP_MS) / 1000, base, ctx),
      STEP_MS,
    );
    await sleep(STEP_MS);
  }
  await transport.setGradient(base, 600);
}
