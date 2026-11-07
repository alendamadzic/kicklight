import { describe, expect, test } from "bun:test";
import { dateKeyIn, shiftDateKey } from "./format";

describe("shiftDateKey", () => {
  test("moves across month and year ends", () => {
    expect(shiftDateKey("20261231", 1)).toBe("20270101");
    expect(shiftDateKey("20270101", -1)).toBe("20261231");
    expect(shiftDateKey("20261107", 0)).toBe("20261107");
  });
  test("handles leap days", () => {
    expect(shiftDateKey("20280228", 1)).toBe("20280229");
  });
});

describe("dateKeyIn", () => {
  // 23:30 UTC on 7 Nov 2026.
  const now = Date.UTC(2026, 10, 7, 23, 30);
  test("uses the zone's own day", () => {
    expect(dateKeyIn("Europe/London", 0, now)).toBe("20261107");
    expect(dateKeyIn("Europe/Berlin", 0, now)).toBe("20261108");
    expect(dateKeyIn("America/New_York", 0, now)).toBe("20261107");
  });
  test("applies the offset", () => {
    expect(dateKeyIn("Europe/Berlin", -1, now)).toBe("20261107");
    expect(dateKeyIn("Europe/London", 1, now)).toBe("20261108");
  });
  test("falls back to UTC for an unknown zone", () => {
    expect(dateKeyIn("Not/AZone", 0, now)).toBe("20261107");
  });
});
