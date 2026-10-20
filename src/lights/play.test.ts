import { expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { EFFECTS } from "@/engine/effects";
import { playFrames } from "./play";
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
