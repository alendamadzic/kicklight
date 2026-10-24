import { describe, expect, test } from "bun:test";
import { brightnessFor, resampleNearest } from "./gradient";

describe("resampleNearest", () => {
  test("is the identity at the same size and nearest-neighbour otherwise", () => {
    expect(resampleNearest([1, 2, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5]);
    expect(resampleNearest(["h", "h", "a", "a"], 8)).toEqual([
      "h",
      "h",
      "h",
      "h",
      "a",
      "a",
      "a",
      "a",
    ]);
    expect(resampleNearest([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toEqual([
      2, 4, 6, 8, 10,
    ]);
    expect(resampleNearest(["a", "b"], 5)).toEqual(["a", "a", "b", "b", "b"]);
  });

  test("nothing in, nothing out", () => {
    expect(resampleNearest([], 5)).toEqual([]);
  });
});

test("brightness follows the brightest channel", () => {
  expect(brightnessFor([[255, 0, 0]])).toBe(100);
  expect(brightnessFor([[0, 0, 0]])).toBe(1);
  expect(brightnessFor([[128, 0, 0]], 50)).toBe(25);
});
