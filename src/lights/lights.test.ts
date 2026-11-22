import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { CommandQueue } from "./queue";
import { fillPoints, HALFWAY, splitPoints } from "./render";
import { clampToGamut, GAMUT_C, rgbToXy } from "./xy";

const H: Rgb = [108, 171, 221];
const A: Rgb = [200, 16, 46];
const colors = { home: H, away: A };

describe("xy", () => {
  test("white lands near the D65 white point", () => {
    const p = rgbToXy([255, 255, 255]);
    expect(p.x).toBeCloseTo(0.3227, 2);
    expect(p.y).toBeCloseTo(0.329, 2);
  });

  test("pure green is clamped into gamut C", () => {
    const p = rgbToXy([0, 255, 0]);
    expect(p.x).toBeGreaterThanOrEqual(GAMUT_C.g.x - 0.2);
    // Whatever comes back must be inside the triangle (clamping again is a no-op).
    expect(clampToGamut(p)).toEqual(p);
  });

  test("black does not divide by zero", () => {
    const p = rgbToXy([0, 0, 0]);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe("render", () => {
  test("a 70/30 split on 5 points is 4 home / 1 away, the nearest the strip can show", () => {
    const p = splitPoints(0.7, 5, colors);
    expect(p.filter((c) => c === H)).toHaveLength(4);
    expect(p.filter((c) => c === A)).toHaveLength(1);
  });

  test("an even split on an odd strip puts the halfway line in the middle", () => {
    for (const share of [0.5, 0.46, 0.54, 0.45, 0.55]) {
      expect(splitPoints(share, 5, colors)).toEqual([H, H, HALFWAY, A, A]);
    }
    expect(splitPoints(0.5, 7, colors)).toEqual([H, H, H, HALFWAY, A, A, A]);
    // Past the centre point the break moves a whole point, as before.
    expect(splitPoints(0.57, 5, colors)).toEqual([H, H, H, A, A]);
    expect(splitPoints(0.43, 5, colors)).toEqual([H, H, A, A, A]);
  });

  test("the virtual strip draws the line over the same range as a 5-point strip", () => {
    const p = splitPoints(0.5, 30, colors);
    expect(p.slice(0, 14).every((c) => c === H)).toBe(true);
    expect(p.slice(14, 16)).toEqual([HALFWAY, HALFWAY]);
    expect(p.slice(16).every((c) => c === A)).toBe(true);
    expect(splitPoints(0.55, 30, colors)).toContain(HALFWAY);
    expect(splitPoints(0.57, 30, colors)).not.toContain(HALFWAY);
  });

  test("a tiny share still shows a team, and 0/100 shows only one", () => {
    expect(splitPoints(0.03, 5, colors).filter((c) => c === H)).toHaveLength(1);
    expect(splitPoints(0.97, 5, colors).filter((c) => c === A)).toHaveLength(1);
    expect(splitPoints(0, 5, colors).every((c) => c === A)).toBe(true);
    expect(splitPoints(1, 5, colors).every((c) => c === H)).toBe(true);
  });

  test("clock fill grows from the home end", () => {
    const p = fillPoints(0.4, "home", 5, colors);
    expect(p[0]).toEqual(H);
    expect(p[1]).toEqual(H);
    expect(p[2][0]).toBeLessThan(20);
  });
});

describe("command queue", () => {
  test("never exceeds the send rate", async () => {
    let clock = 0;
    const sent: number[] = [];
    const q = new CommandQueue({
      minIntervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    for (let i = 0; i < 5; i++)
      q.push({ key: `e${i}`, run: () => void sent.push(clock) });
    await q.idle();
    expect(sent).toHaveLength(5);
    for (let i = 1; i < sent.length; i++)
      expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(100);
  });

  test("a newer resting state replaces an unsent older one, effects are kept", async () => {
    let clock = 0;
    const ran: string[] = [];
    const q = new CommandQueue({
      minIntervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    q.push({ key: "first", run: () => void ran.push("first") });
    q.push({
      key: "split-a",
      coalesce: "gradient",
      run: () => void ran.push("split-a"),
    });
    q.push({ key: "goal", run: () => void ran.push("goal") });
    q.push({
      key: "split-b",
      coalesce: "gradient",
      run: () => void ran.push("split-b"),
    });
    await q.idle();
    expect(ran).toEqual(["first", "goal", "split-b"]);
  });

  test("a failing job is reported and does not stall the queue", async () => {
    const errors: string[] = [];
    const ran: string[] = [];
    const q = new CommandQueue({
      minIntervalMs: 0,
      onError: (k) => errors.push(k),
    });
    q.push({ key: "bad", run: () => Promise.reject(new Error("boom")) });
    q.push({ key: "good", run: () => void ran.push("good") });
    await q.idle();
    expect(errors).toEqual(["bad"]);
    expect(ran).toEqual(["good"]);
  });
});
