import { describe, expect, test } from "bun:test";
import { SCENARIOS } from "@/engine/feed/scenarios";
import {
  isRgb,
  isRgbList,
  parseFireEffect,
  parseIdentifyLight,
  parseKitOverrides,
  parseSelectLight,
  parseSetLights,
  parseStartSession,
} from "./validate";

describe("colours", () => {
  test("rgb", () => {
    expect(isRgb([0, 128, 255])).toBe(true);
    expect(isRgb([0, 128, 256])).toBe(false);
    expect(isRgb([0, 128])).toBe(false);
    expect(isRgb(["a", 1, 2])).toBe(false);
    expect(isRgb([Number.NaN, 1, 2])).toBe(false);
  });
  test("rgb list is bounded", () => {
    expect(isRgbList([[1, 2, 3]])).toBe(true);
    expect(isRgbList([])).toBe(false);
    expect(isRgbList(Array.from({ length: 28 }, () => [0, 0, 0]))).toBe(false);
  });
});

describe("parseStartSession", () => {
  test("a live match in a known league", () => {
    expect(
      parseStartSession({
        league: "eng.1",
        eventId: "401879267",
        stat: "shots",
      }),
    ).toEqual({
      league: "eng.1",
      eventId: "401879267",
      stat: "shots",
      delayMs: undefined,
    });
  });
  test("a scripted match must be a real scenario", () => {
    const id = SCENARIOS[0].id;
    expect(parseStartSession({ league: "replay", eventId: id })?.eventId).toBe(
      id,
    );
    expect(parseStartSession({ league: "replay", eventId: "nope" })).toBeNull();
  });
  test("unknown leagues, odd ids and missing bodies are rejected", () => {
    expect(parseStartSession({ league: "xyz.9", eventId: "1" })).toBeNull();
    expect(parseStartSession({ league: "eng.1", eventId: "a b" })).toBeNull();
    expect(parseStartSession(null)).toBeNull();
  });
  test("an unknown stat or out-of-range delay falls back to the defaults", () => {
    const b = parseStartSession({
      league: "eng.1",
      eventId: "1",
      stat: "vibes",
      delayMs: 999_999,
    });
    expect(b?.stat).toBeUndefined();
    expect(b?.delayMs).toBeUndefined();
    expect(
      parseStartSession({ league: "eng.1", eventId: "1", delayMs: 1500.4 })
        ?.delayMs,
    ).toBe(1500);
  });
});

describe("parseFireEffect", () => {
  test("needs a real effect and both colours; side is optional", () => {
    expect(
      parseFireEffect({ effect: "goal", home: [1, 2, 3], away: [4, 5, 6] }),
    ).toEqual({ effect: "goal", side: null, home: [1, 2, 3], away: [4, 5, 6] });
    expect(
      parseFireEffect({
        effect: "goal",
        side: "away",
        home: [1, 2, 3],
        away: [4, 5, 6],
      })?.side,
    ).toBe("away");
    expect(
      parseFireEffect({ effect: "rocket", home: [1, 2, 3], away: [4, 5, 6] }),
    ).toBeNull();
    expect(parseFireEffect({ effect: "goal", home: [1, 2, 3] })).toBeNull();
  });
});

describe("parseSetLights", () => {
  test("clamps the transition and defaults it", () => {
    expect(parseSetLights({ colors: [[1, 2, 3]] })?.transitionMs).toBe(300);
    expect(
      parseSetLights({ colors: [[1, 2, 3]], transitionMs: 99_999 })
        ?.transitionMs,
    ).toBe(5000);
    expect(parseSetLights({ colors: [] })).toBeNull();
  });
});

describe("parseSelectLight", () => {
  test("takes a UUID and trims the name", () => {
    const id = "0b3a9f8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(
      parseSelectLight({ lightId: id, lightName: "x".repeat(100) }),
    ).toEqual({ lightId: id, lightName: "x".repeat(80) });
    expect(parseSelectLight({ lightId: "../etc" })).toBeNull();
  });
});

describe("parseIdentifyLight", () => {
  test("takes a light uuid", () => {
    const id = "2b9e5a3c-1d4f-4e8a-9b7c-0123456789ab";
    expect(parseIdentifyLight({ lightId: id })).toEqual({ lightId: id });
  });
  test("rejects anything else", () => {
    expect(parseIdentifyLight({ lightId: "../config" })).toBeNull();
    expect(parseIdentifyLight(null)).toBeNull();
  });
});

describe("parseKitOverrides", () => {
  test("keeps well-formed choices and drops the rest", () => {
    expect(
      parseKitOverrides({
        a: "primary",
        b: "alternate",
        c: "#cfe86b",
        d: "teal",
        e: 3,
      }),
    ).toEqual({ a: "primary", b: "alternate", c: "#cfe86b" });
  });
  test("non-objects become empty", () => {
    expect(parseKitOverrides(null)).toEqual({});
    expect(parseKitOverrides(["primary"])).toEqual({});
  });
});
