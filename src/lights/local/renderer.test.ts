import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { EFFECTS } from "@/engine/effects";
import { splitPoints } from "../render";
import { createRenderer } from "./renderer";

const H: Rgb = [108, 171, 221];
const A: Rgb = [200, 16, 46];
const colors = { home: H, away: A };
const near = (a: Rgb[], b: Rgb[], eps = 1e-9) =>
  a.length === b.length &&
  a.every((c, i) => c.every((v, k) => Math.abs(v - b[i][k]) <= eps));

describe("renderer resting states", () => {
  test("a split renders at the channel count and snaps in on first use", () => {
    const r = createRenderer({ channels: 7, colors });
    r.apply({ kind: "split", homeShare: 4 / 7 }, 1000);
    expect(r.frame(1000)).toEqual(splitPoints(4 / 7, 7, colors));
    expect(r.frame(1000)).toHaveLength(7);
  });

  test("later states ease over about a second", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "split", homeShare: 1 }, 0);
    r.apply({ kind: "split", homeShare: 0 }, 10_000);
    const start = r.frame(10_000);
    const mid = r.frame(10_500);
    const end = r.frame(11_000);
    expect(near(start, splitPoints(1, 5, colors) as Rgb[])).toBe(true);
    expect(near(end, splitPoints(0, 5, colors) as Rgb[])).toBe(true);
    // halfway through a smoothstep is exactly the midpoint
    expect(mid[0][0]).toBeCloseTo((H[0] + A[0]) / 2, 6);
    expect(r.frame(20_000)).toEqual(end);
  });

  test("a new state mid-ease starts from where the strip is", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "split", homeShare: 1 }, 0);
    r.apply({ kind: "split", homeShare: 0 }, 1000);
    const before = r.frame(1500);
    r.apply({ kind: "split", homeShare: 1 }, 1500);
    expect(near(r.frame(1500), before)).toBe(true);
  });

  test("fill commands render the clock bar", () => {
    const r = createRenderer({ channels: 10, colors });
    r.apply({ kind: "fill", fraction: 0.5, lead: "home" }, 0);
    const f = r.frame(0);
    expect(f.slice(0, 5).every((c) => near([c], [H]))).toBe(true);
    expect(f[9][0]).toBeCloseTo(H[0] * 0.06);
  });
});

describe("renderer effects", () => {
  const goal = EFFECTS.goal;
  if (!goal) throw new Error("goal effect missing");

  test("an effect starts, plays for its duration and ends on the resting colours", () => {
    const r = createRenderer({ channels: 7, colors });
    r.apply({ kind: "split", homeShare: 0.5 }, 0);
    const rest = r.frame(1000);
    r.apply({ kind: "effect", effect: "goal", side: "home" }, 1000);

    expect(r.activeEffects(1000)).toEqual(["goal"]);
    // while playing, the strip differs from rest
    expect(near(r.frame(1700), rest)).toBe(false);
    // and it is exactly the effect's own frame over the resting base
    expect(r.frame(2000)).toEqual(
      goal
        .frame(1.0, rest, { home: H, away: A, side: "home", winner: null })
        .map((c) => c.map((v) => Math.min(255, Math.max(0, v))) as Rgb),
    );
    // just before the end it is still playing, at the end it is gone
    expect(r.activeEffects(1000 + goal.durationMs - 1)).toEqual(["goal"]);
    expect(r.activeEffects(1000 + goal.durationMs)).toEqual([]);
    expect(near(r.frame(1000 + goal.durationMs), rest)).toBe(true);
    expect(near(r.frame(1000 + goal.durationMs + 5000), rest)).toBe(true);
  });

  test("the same script gives byte-identical frames on two renderers", () => {
    const script = (r: ReturnType<typeof createRenderer>) => {
      r.apply({ kind: "split", homeShare: 0.6 }, 0);
      r.apply({ kind: "effect", effect: "yellow_card", side: "away" }, 2000);
      r.apply({ kind: "split", homeShare: 0.4 }, 2500);
      r.apply({ kind: "effect", effect: "corner", side: "home" }, 3000);
      const out: Rgb[][] = [];
      for (let t = 0; t <= 9000; t += 20) out.push(r.frame(t));
      return out;
    };
    const a = script(createRenderer({ channels: 7, colors }));
    const b = script(createRenderer({ channels: 7, colors }));
    expect(a).toEqual(b);
    expect(a).toHaveLength(451);
  });

  test("frame() is a pure function of time", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "split", homeShare: 0.5 }, 0);
    r.apply({ kind: "effect", effect: "goal", side: "home" }, 100);
    const t1 = r.frame(1234);
    r.frame(5000);
    r.frame(300);
    expect(r.frame(1234)).toEqual(t1);
  });

  test("effects composite in the order they started", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "split", homeShare: 0.5 }, 0);
    r.apply({ kind: "effect", effect: "yellow_card", side: "home" }, 100);
    r.apply({ kind: "effect", effect: "goal", side: "away" }, 200);
    expect(r.activeEffects(300)).toEqual(["yellow_card", "goal"]);
    const rest = r.frame(0);
    const yc = EFFECTS.yellow_card?.frame(0.2, rest, {
      home: H,
      away: A,
      side: "home",
      winner: null,
    }) as Rgb[];
    const both = goal.frame(0.1, yc, {
      home: H,
      away: A,
      side: "away",
      winner: null,
    });
    expect(
      near(
        r.frame(300),
        both.map((c) => c.map((v) => Math.min(255, Math.max(0, v))) as Rgb),
      ),
    ).toBe(true);
  });

  test("unknown effects are ignored", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "split", homeShare: 0.5 }, 0);
    // @ts-expect-error not a real effect key
    r.apply({ kind: "effect", effect: "not_a_thing", side: null }, 0);
    expect(r.activeEffects(1)).toEqual([]);
  });
});

describe("renderer restore", () => {
  test("fades to black, clears effects and then reports finished", () => {
    const r = createRenderer({ channels: 5, colors, fadeOutMs: 1000 });
    r.apply({ kind: "split", homeShare: 0.5 }, 0);
    r.apply({ kind: "effect", effect: "goal", side: "home" }, 100);
    r.apply({ kind: "restore" }, 2000);
    expect(r.activeEffects(2000)).toEqual([]);
    expect(r.finished(2500)).toBe(false);
    const mid = r.frame(2500);
    expect(mid[0][0]).toBeGreaterThan(0);
    expect(r.finished(3000)).toBe(true);
    expect(r.frame(3000).every((c) => c.every((v) => v === 0))).toBe(true);
  });

  test("a new state after restore lights the strip again", () => {
    const r = createRenderer({ channels: 5, colors });
    r.apply({ kind: "restore" }, 0);
    r.apply({ kind: "split", homeShare: 1 }, 5000);
    expect(r.finished(5000)).toBe(false);
    expect(r.frame(7000)[0]).toEqual(H);
  });
});
