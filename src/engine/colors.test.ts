import { describe, expect, test } from "bun:test";
import {
  applyKitOverride,
  hexToRgb,
  liftForGlow,
  luminance,
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
