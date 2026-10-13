import type { Rgb } from "@/engine/colors";

export interface Xy {
  x: number;
  y: number;
}

export interface Gamut {
  r: Xy;
  g: Xy;
  b: Xy;
}

/** Gamut C: Hue Flux, Play, Ambiance gradient and most recent colour lights. Reported by the strip itself. */
export const GAMUT_C: Gamut = {
  r: { x: 0.6915, y: 0.3083 },
  g: { x: 0.17, y: 0.7 },
  b: { x: 0.1532, y: 0.0475 },
};

const toLinear = (c: number) => {
  const v = c / 255;
  return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
};

const cross = (a: Xy, b: Xy) => a.x * b.y - a.y * b.x;
const sub = (a: Xy, b: Xy): Xy => ({ x: a.x - b.x, y: a.y - b.y });

function inGamut(p: Xy, g: Gamut): boolean {
  const v1 = sub(g.g, g.r);
  const v2 = sub(g.b, g.r);
  const q = sub(p, g.r);
  const s = cross(q, v2) / cross(v1, v2);
  const t = cross(v1, q) / cross(v1, v2);
  return s >= 0 && t >= 0 && s + t <= 1;
}

function closestOnSegment(p: Xy, a: Xy, b: Xy): Xy {
  const ab = sub(b, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y),
    ),
  );
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

export function clampToGamut(p: Xy, g: Gamut = GAMUT_C): Xy {
  if (inGamut(p, g)) return p;
  const candidates = [
    closestOnSegment(p, g.r, g.g),
    closestOnSegment(p, g.g, g.b),
    closestOnSegment(p, g.b, g.r),
  ];
  let best = candidates[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** sRGB → CIE xy using Philips' Wide RGB D65 matrix, clamped to the light's gamut. */
export function rgbToXy([r, g, b]: Rgb, gamut: Gamut = GAMUT_C): Xy {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return clampToGamut({ x: 0.3227, y: 0.329 }, gamut);
  return clampToGamut({ x: X / sum, y: Y / sum }, gamut);
}
