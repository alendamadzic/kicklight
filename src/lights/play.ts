import type { Rgb } from "@/engine/colors";
import type { Effect, EffectContext } from "@/engine/effects";
import type { LightTransport } from "./transport";

// Plays an effect on a strip that can't stream: samples the effect's own frames a few
// times a second and eases between them with REST gradient writes, then settles back
// on the resting strip. Coarser than the 50 Hz stream, but the same animation.

/** ~3 writes a second keeps well inside the Hue API's per-light rate limit. */
const STEP_MS = 330;

export async function playFrames(
  transport: LightTransport,
  fx: Effect,
  ctx: EffectContext,
  base: Rgb[],
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let ms = 0; ms < fx.durationMs; ms += STEP_MS) {
    // Aim each write at the frame it will land on, so the eases line up with the animation.
    await transport.setGradient(
      fx.frame((ms + STEP_MS) / 1000, base, ctx),
      STEP_MS,
    );
    await sleep(STEP_MS);
  }
  await transport.setGradient(base, 600);
}
