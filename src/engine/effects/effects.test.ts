import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { EFFECTS, type EffectContext, PAD_ORDER } from "@/engine/effects";

const base: Rgb[] = Array.from({ length: 24 }, (_, i) =>
  i < 14 ? [108, 171, 221] : [200, 16, 46],
);
const ctx: EffectContext = {
  home: [108, 171, 221],
  away: [200, 16, 46],
  side: "home",
  winner: "home",
};

describe("effects", () => {
  for (const [key, fx] of Object.entries(EFFECTS)) {
    test(`${key}: stays in gamut, keeps channel count, never mutates base`, () => {
      if (!fx) throw new Error("missing effect");
      const before = JSON.stringify(base);
      for (let t = 0; t <= fx.durationMs / 1000; t += 0.1) {
        const out = fx.frame(t, base, ctx);
        expect(out).toHaveLength(base.length);
        for (const c of out) {
          for (const v of c) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(-0.001);
            expect(v).toBeLessThanOrEqual(255.001);
          }
        }
      }
      expect(JSON.stringify(base)).toBe(before);
    });
  }

  test("the goal effect ends back on the resting colours", () => {
    const goal = EFFECTS.goal;
    if (!goal) throw new Error("missing goal effect");
    const end = goal.frame(goal.durationMs / 1000, base, ctx);
    end.forEach((c, i) => {
      c.forEach((v, k) => {
        expect(v).toBeCloseTo(base[i][k], 0);
      });
    });
  });

  test("the cloud fallback exists for the effects that matter", () => {
    for (const k of [
      "goal",
      "yellow_card",
      "red_card",
      "penalty_awarded",
    ] as const) {
      expect(EFFECTS[k]?.signal?.(ctx).durationMs).toBeGreaterThan(0);
    }
  });

  test("the event pad only lists effects that exist", () => {
    for (const k of PAD_ORDER) expect(EFFECTS[k]).toBeDefined();
  });
});
