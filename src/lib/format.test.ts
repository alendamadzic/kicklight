import { describe, expect, test } from "bun:test";
import { dateKeyIn, kickoffLabel, shiftDateKey } from "./format";

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

describe("kickoffLabel", () => {
  const ko = "2026-11-07T19:30:00Z";
  test("shows only the time on the day itself", () => {
    expect(kickoffLabel(ko, "20261107", "Europe/London")).toBe("19:30");
  });
  test("adds the weekday on another day", () => {
    expect(kickoffLabel(ko, "20261106", "Europe/London")).toBe("Sat 19:30");
  });
  test("uses the zone's own clock and day", () => {
    expect(
      kickoffLabel("2026-11-07T23:30:00Z", "20261108", "Europe/Berlin"),
    ).toBe("00:30");
  });
  test("is empty for a bad date", () => {
    expect(kickoffLabel("nope", "20261107", "Europe/London")).toBe("");
  });
});
