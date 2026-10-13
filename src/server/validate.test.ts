import { describe, expect, test } from "bun:test";
import { isRgb, isRgbList } from "./validate";

describe("validate", () => {
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
