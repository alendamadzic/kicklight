// Kit colour handling for a light strip: what looks right on a TV wall is not what looks right on a shirt.

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Perceptual-ish brightness, 0-255. */
export function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function distance(a: Rgb, b: Rgb): number {
  // Weighted RGB distance ("redmean"), good enough for clash detection.
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db,
  );
}

const CLASH_THRESHOLD = 110;
const WARM_WHITE: Rgb = [255, 244, 230];
/** Below this a colour is effectively invisible on an LED strip. */
const MIN_LUMINANCE = 48;

/**
 * Lift near-black kit colours so they still glow. Black becomes warm white;
 * dark navy is brightened but keeps its hue.
 */
export function liftForGlow(rgb: Rgb): Rgb {
  const lum = luminance(rgb);
  if (lum >= MIN_LUMINANCE) return rgb;
  const max = Math.max(...rgb);
  // Truly neutral dark (black, charcoal): go warm white.
  if (max - Math.min(...rgb) < 24) return WARM_WHITE;
  // Dark but saturated (navy, maroon): scale up to the minimum.
  const k = MIN_LUMINANCE / Math.max(lum, 1);
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k].map((v) =>
    Math.min(255, v),
  ) as Rgb;
}

export interface StripColors {
  home: Rgb;
  away: Rgb;
  /** True when the away side had to switch to its alternate colour. */
  awaySwitched: boolean;
}

/**
 * Pick the two colours the strip will show. Home keeps its primary; away
 * switches to its alternate when the primaries would be hard to tell apart.
 */
export function pickStripColors(
  home: { color: string; alternateColor: string },
  away: { color: string; alternateColor: string },
): StripColors {
  const h = liftForGlow(hexToRgb(home.color));
  let a = liftForGlow(hexToRgb(away.color));
  let awaySwitched = false;
  if (distance(h, a) < CLASH_THRESHOLD) {
    const alt = liftForGlow(hexToRgb(away.alternateColor));
    if (distance(h, alt) > distance(h, a)) {
      a = alt;
      awaySwitched = true;
    }
  }
  return { home: h, away: a, awaySwitched };
}
