import { expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { EFFECTS, type Effect } from "@/engine/effects";
import { playFrames, sampleFrame } from "./play";
import { splitPoints } from "./render";
import type { LightTransport } from "./transport";

const colors = { home: [108, 171, 221] as Rgb, away: [200, 16, 46] as Rgb };

test("plays an effect without a signal as keyframes, then settles on the base", async () => {
  const writes: Rgb[][] = [];
  const transport = {
    points: 5,
    setGradient: async (c: Rgb[]) => {
      writes.push(c);
    },
  } as unknown as LightTransport;
  const fx = EFFECTS.corner;
  if (!fx) throw new Error("corner effect missing");
  const base = splitPoints(0.5, 5, colors);

  await playFrames(
    transport,
    fx,
    { ...colors, side: "home", winner: null },
    base,
    async () => {},
  );

  expect(writes.length).toBeGreaterThan(5);
  expect(writes.some((w) => w.join() !== base.join())).toBe(true);
  expect(writes.at(-1)).toEqual(base);
});

test("a thin scan bar between two points still shows on 5 points", () => {
  const fx = EFFECTS.var;
  if (!fx) throw new Error("var effect missing");
  const base = splitPoints(0.5, 5, colors);
  const ctx = { ...colors, side: null, winner: null };
  // At 0.3 s the white bar sits an eighth of the way along, between points 0 and 1.
  const whitest = (f: Rgb[]) => Math.max(...f.map((c) => Math.min(...c)));
  expect(whitest(fx.frame(0.3, base, ctx))).toBeLessThan(40);
  expect(whitest(sampleFrame(fx, 0.3, base, ctx))).toBeGreaterThan(60);
});

test("parts of the strip an effect leaves alone stay exactly as they were", () => {
  // Lights up the first half of the strip and leaves the rest alone.
  const fx: Effect = {
    key: "corner",
    label: "Half",
    durationMs: 1000,
    frame: (_t, base) =>
      base.map((c, i) => (i < base.length / 2 ? ([255, 255, 255] as Rgb) : c)),
  };
  const base = splitPoints(0.5, 5, colors);
  const frame = sampleFrame(fx, 0.01, base, {
    ...colors,
    side: "home",
    winner: null,
  });
  expect(frame.at(-1)).toEqual(base.at(-1));
});

test("an effect picked up late joins part way through, and one already over is skipped", async () => {
  const writes: Rgb[][] = [];
  const transport = {
    points: 5,
    setGradient: async (c: Rgb[]) => {
      writes.push(c);
    },
  } as unknown as LightTransport;
  const fx = EFFECTS.goal;
  if (!fx) throw new Error("goal effect missing");
  const base = splitPoints(0.5, 5, colors);
  const ctx = { ...colors, side: "home" as const, winner: null };
  const skip = async () => {};

  await playFrames(transport, fx, ctx, base, skip);
  const full = writes.length;
  writes.length = 0;
  await playFrames(transport, fx, ctx, base, skip, fx.durationMs / 2);
  expect(writes.length).toBeLessThan(full * 0.6);
  writes.length = 0;
  await playFrames(transport, fx, ctx, base, skip, fx.durationMs);
  expect(writes).toHaveLength(0);
});
