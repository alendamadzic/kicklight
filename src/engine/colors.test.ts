import { describe, expect, test } from "bun:test";
import {
  hexToRgb,
  liftForGlow,
  luminance,
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
