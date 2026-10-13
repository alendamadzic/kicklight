import type { Rgb } from "@/engine/colors";
import type { SignalFallback } from "@/engine/effects";

/** What a physical (or virtual) strip must be able to do. */
export interface LightTransport {
  readonly kind: "remote" | "local" | "entertainment" | "virtual";
  /** Number of gradient points the strip accepts (5 on a Flux). */
  readonly points: number;
  /** Show a steady gradient, easing there over `transitionMs`. */
  setGradient(colors: Rgb[], transitionMs?: number): Promise<void>;
  /** Native bridge-side flash. Optional: not every transport can do it. */
  signal?(s: SignalFallback): Promise<void>;
  /** Stream per-channel frames at ~50 Hz. Present only on Entertainment transports. */
  stream?(frames: AsyncIterable<Rgb[]>): Promise<void>;
  /** Remember what the light was doing before kick-off. */
  snapshot(): Promise<unknown>;
  /** Put the light back how it was. */
  restore(snapshot: unknown): Promise<void>;
}
