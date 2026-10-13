import type { Rgb } from "@/engine/colors";

export function isRgb(v: unknown): v is Rgb {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 255,
    )
  );
}

export function isRgbList(v: unknown, max = 27): v is Rgb[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(isRgb);
}
