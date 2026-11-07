import { describe, expect, test } from "bun:test";
import {
  applyKitOverride,
  clashes,
  hexToRgb,
  liftForGlow,
  luminance,
  matchKitKey,
  needsLift,
  pickStripColors,
  rgbToHex,
} from "@/engine/colors";

describe("colors", () => {
  test("hex round trip", () => {
    expect(rgbToHex(hexToRgb("#6CABDD"))).toBe("#6cabdd");
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });

  test("black kit becomes warm white so it can glow", () => {
    const lifted = liftForGlow(hexToRgb("#000000"));
    expect(luminance(lifted)).toBeGreaterThan(200);
  });

  test("dark navy keeps its hue but gets brighter", () => {
    const navy = hexToRgb("#0B1B3D");
    const lifted = liftForGlow(navy);
    expect(luminance(lifted)).toBeGreaterThan(luminance(navy));
    expect(lifted[2]).toBeGreaterThan(lifted[0]);
  });

  test("clashing reds make away switch to its alternate", () => {
    const out = pickStripColors(
      { color: "#C8102E", alternateColor: "#FFFFFF" },
      { color: "#DD0000", alternateColor: "#FFFFFF" },
    );
    expect(out.awaySwitched).toBe(true);
    expect(rgbToHex(out.away)).toBe("#ffffff");
  });

  test("distinct kits are left alone", () => {
    const out = pickStripColors(
      { color: "#6CABDD", alternateColor: "#FFFFFF" },
      { color: "#C8102E", alternateColor: "#FFFFFF" },
    );
    expect(out.awaySwitched).toBe(false);
  });
});

describe("kit overrides", () => {
  const spurs = {
    id: "367",
    color: "#132257",
    alternateColor: "#ffffff",
  };
  test("no choice, or primary, leaves the team alone", () => {
    expect(applyKitOverride(spurs, {})).toBe(spurs);
    expect(applyKitOverride(spurs, { "367": "primary" })).toBe(spurs);
  });
  test("alternate swaps the kit colours", () => {
    const t = applyKitOverride(spurs, { "367": "alternate" });
    expect(t.color).toBe("#ffffff");
    expect(t.alternateColor).toBe("#132257");
  });
  test("a custom colour falls back to the team's own primary", () => {
    const t = applyKitOverride(spurs, { "367": "#cfe86b" });
    expect(t.color).toBe("#cfe86b");
    expect(t.alternateColor).toBe("#132257");
  });
  test("malformed choices are ignored", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately bad stored data
    expect(applyKitOverride(spurs, { "367": "teal" as any })).toBe(spurs);
  });
  test("a custom colour that clashes still gets switched by the clash rule", () => {
    const home = { id: "1", color: "#c8102e", alternateColor: "#ffffff" };
    const away = applyKitOverride(
      { id: "2", color: "#0000ff", alternateColor: "#ffffff" },
      { "2": "#d01030" },
    );
    expect(pickStripColors(home, away).awaySwitched).toBe(true);
  });
  test("needsLift spots colours too dark to glow", () => {
    expect(needsLift(hexToRgb("#132257"))).toBe(true);
    expect(needsLift(hexToRgb("#6cabdd"))).toBe(false);
  });
});

// Real ESPN kit colours from sessions that glowed red on red.
const MUN = { id: "360", color: "#da020e", alternateColor: "#4169e1" };
const LIV = { id: "364", color: "#d11317", alternateColor: "#ffffff" };
const ATM = { id: "1068", color: "#ca3624", alternateColor: "#000000" };
const ROMA = { id: "104", color: "#990a2c", alternateColor: "#f5f3e5" };

describe("clashes on the strip", () => {
  test("reds of any shade clash, since the strip shows one brightness", () => {
    expect(clashes(hexToRgb(MUN.color), hexToRgb(LIV.color))).toBe(true);
    expect(clashes(hexToRgb(ATM.color), hexToRgb(MUN.color))).toBe(true);
    expect(clashes(hexToRgb(MUN.color), hexToRgb(ROMA.color))).toBe(true);
  });
  test("red and orange, or claret and red, still tell apart", () => {
    expect(clashes(hexToRgb("#d11317"), hexToRgb("#f28800"))).toBe(false);
    expect(clashes(hexToRgb("#7a263a"), hexToRgb("#da020e"))).toBe(false);
  });
  test("Atlético v Man Utd: away goes royal blue", () => {
    const out = pickStripColors(ATM, MUN);
    expect(out.awaySwitched).toBe(true);
    expect(rgbToHex(out.away)).toBe("#4169e1");
  });
  test("Man Utd v Roma: away goes to its light kit", () => {
    expect(pickStripColors(MUN, ROMA).awaySwitched).toBe(true);
  });
  test("home switches when away can't", () => {
    const away = { ...LIV, alternateColor: "#c8102e" };
    const out = pickStripColors(MUN, away);
    expect(out.awaySwitched).toBe(false);
    expect(out.homeSwitched).toBe(true);
    expect(rgbToHex(out.home)).toBe("#4169e1");
  });
});

describe("kit choices for one match", () => {
  const overrides = { [matchKitKey("401878755", LIV.id)]: "#ffd23f" } as const;
  test("apply only to that match", () => {
    expect(applyKitOverride(LIV, overrides, "401878755").color).toBe("#ffd23f");
    expect(applyKitOverride(LIV, overrides, "999")).toBe(LIV);
    expect(applyKitOverride(LIV, overrides)).toBe(LIV);
  });
  test("win over the every-match choice", () => {
    const both = { ...overrides, [LIV.id]: "alternate" } as const;
    expect(applyKitOverride(LIV, both, "401878755").color).toBe("#ffd23f");
    expect(applyKitOverride(LIV, both, "999").color).toBe("#ffffff");
  });
  test("are pinned: the clash rule leaves them, even red on red", () => {
    const pinned = applyKitOverride(
      LIV,
      { [matchKitKey("m", LIV.id)]: "primary" },
      "m",
    );
    const pinnedHome = applyKitOverride(
      MUN,
      { [matchKitKey("m", MUN.id)]: "primary" },
      "m",
    );
    const out = pickStripColors(pinnedHome, pinned);
    expect(out.awaySwitched || out.homeSwitched).toBe(false);
  });
  test("pinning away makes home give way instead", () => {
    const away = applyKitOverride(
      LIV,
      { [matchKitKey("m", LIV.id)]: "primary" },
      "m",
    );
    const out = pickStripColors(MUN, away);
    expect(out.homeSwitched).toBe(true);
    expect(rgbToHex(out.away)).toBe("#d11317");
  });
});
