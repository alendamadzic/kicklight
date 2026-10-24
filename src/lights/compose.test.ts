import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { EMPTY_SIDE_STATS, type MatchSnapshot } from "@/engine/model";
import type { SessionMirror } from "@/lib/api-types";
import { composeFrame, DIM, frameFromMirror, resolveMirror } from "./compose";

const HOME: Rgb = [200, 0, 0];
const AWAY: Rgb = [0, 0, 200];

const match: MatchSnapshot = {
  id: "m",
  league: "eng.1",
  phase: "second_half",
  minute: 60,
  home: {
    id: "h",
    name: "Home",
    short: "HOM",
    color: "#c80000",
    alternateColor: "#fff",
  },
  away: {
    id: "a",
    name: "Away",
    short: "AWY",
    color: "#0000c8",
    alternateColor: "#fff",
  },
  score: { home: 1, away: 0 },
  stats: { home: { ...EMPTY_SIDE_STATS }, away: { ...EMPTY_SIDE_STATS } },
};

const mirror = (recent: SessionMirror["recent"]): SessionMirror => ({
  match,
  activeStat: "possession",
  colors: { home: HOME, away: AWAY },
  recent,
  updatedAt: 1_000,
});

describe("composeFrame", () => {
  const resting: Rgb[] = Array.from({ length: 10 }, () => HOME);

  test("returns the resting colours when no effect is running", () => {
    expect(composeFrame(resting, [], 0)).toEqual(resting);
  });

  test("ignores effects that haven't started or already finished", () => {
    const e = {
      effect: "goal" as const,
      startedAt: 10_000,
      side: "home" as const,
      home: HOME,
      away: AWAY,
      winner: null,
    };
    expect(composeFrame(resting, [e], 5_000)).toEqual(resting);
    expect(composeFrame(resting, [e], 10_000 + 60_000)).toEqual(resting);
  });

  test("an active effect changes the frame, reduced motion stays a gentle tint", () => {
    const e = {
      effect: "red_card" as const,
      startedAt: 0,
      side: "home" as const,
      home: HOME,
      away: AWAY,
      winner: null,
    };
    const mid = composeFrame(resting, [e], 2_500);
    expect(mid).not.toEqual(resting);
    const reduced = composeFrame(resting, [e], 2_500, true);
    expect(reduced).toHaveLength(resting.length);
    // Reduced motion never strobes: every LED gets the same colour.
    expect(new Set(reduced.map((c) => c.join(","))).size).toBe(1);
  });
});

describe("mirror replay", () => {
  test("a split command sets the resting share", () => {
    const m = mirror([{ at: 500, kind: "split", homeShare: 0.5 }]);
    const v = resolveMirror(m, 1_000, 10);
    expect(v.share).toBe(0.5);
    expect(v.resting.filter((c) => c === HOME)).toHaveLength(5);
  });

  test("commands due in the future (TV delay) haven't happened yet", () => {
    const m = mirror([
      { at: 100, kind: "split", homeShare: 1 },
      { at: 5_000, kind: "split", homeShare: 0 },
    ]);
    expect(resolveMirror(m, 1_000, 10).share).toBe(1);
    expect(resolveMirror(m, 6_000, 10).share).toBe(0);
  });

  test("restore hands back to a dim resting colour", () => {
    const m = mirror([
      { at: 100, kind: "split", homeShare: 1 },
      { at: 200, kind: "restore" },
    ]);
    expect(resolveMirror(m, 1_000, 4).resting[0]).toEqual(DIM);
  });

  test("an effect command animates the mirrored strip", () => {
    const m = mirror([
      { at: 100, kind: "split", homeShare: 1 },
      { at: 1_000, kind: "effect", effect: "yellow_card", side: "home" },
    ]);
    const quiet = frameFromMirror(m, 900, 6);
    const hit = frameFromMirror(m, 1_000 + 250, 6);
    expect(hit).not.toEqual(quiet);
  });
});
