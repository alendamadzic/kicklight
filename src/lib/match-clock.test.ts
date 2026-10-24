import { describe, expect, test } from "bun:test";
import { clockReading } from "@/engine/feed/espn";
import type { ClockReading } from "@/engine/model";
import {
  clockAt,
  formatClock,
  markAt,
  nextAnchor,
  trackClock,
} from "./match-clock";

const at = 1_000_000;
const reading = (seconds: number, t = at, from = 0): ClockReading => ({
  seconds,
  at: t,
  running: true,
  from,
});

describe("match clock", () => {
  test("runs on from a reading, and back for a TV behind it", () => {
    const r = reading(3725);
    expect(clockAt(r, at + 10_000)).toBe(3735);
    expect(clockAt(r, at - 30_000)).toBe(3695);
    expect(clockAt({ ...r, running: false }, at + 10_000)).toBe(3725);
  });

  test("never runs back past the start of its period", () => {
    expect(clockAt(reading(2710, at, 2700), at - 30_000)).toBe(2700);
  });

  test("a reading a little behind is ignored so the clock never ticks back", () => {
    const prev = reading(5580);
    const late = reading(5580, at + 40_000);
    expect(nextAnchor(prev, late)).toBe(prev);
  });

  test("a reading ahead, a big correction or a new period takes over", () => {
    const prev = reading(3725);
    const ahead = reading(3740, at + 10_000);
    expect(nextAnchor(prev, ahead)).toBe(ahead);
    const fixed = reading(3600, at + 10_000);
    expect(nextAnchor(prev, fixed)).toBe(fixed);
    const second = reading(2700, at + 10_000, 2700);
    expect(nextAnchor(reading(2760), second)).toBe(second);
  });

  test("a delayed TV stays in the first half after the feed reaches half time", () => {
    const first = trackClock(null, reading(2790), "first_half");
    const ht = { seconds: 2790, at: at + 20_000, running: false, from: 0 };
    const track = trackClock(first, ht, "half_time");
    expect(markAt(track, at + 5_000).phase).toBe("first_half");
    expect(markAt(track, at + 25_000).phase).toBe("half_time");
    // Polls at half time that say the same thing keep the first half to fall back on.
    expect(trackClock(track, { ...ht, at: at + 40_000 }, "half_time")).toBe(
      track,
    );
  });

  test("formats as minutes and seconds", () => {
    expect(formatClock(3725.6)).toBe("62:05");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(5640)).toBe("94:00");
  });

  test("ESPN's clock runs from the period's kick-off, through added time", () => {
    const start = at - 2_940_000; // 49 minutes into the second half
    expect(clockReading({ period: 2 }, "second_half", 94, at, start)).toEqual({
      seconds: 5640,
      at,
      running: true,
      from: 2700,
    });
    expect(
      clockReading({ period: 1 }, "half_time", 45, at, start)?.running,
    ).toBe(false);
    expect(clockReading({}, "scheduled", null, at)).toBeUndefined();
  });

  test("without a kick-off stamp it floors at the minute shown", () => {
    expect(
      clockReading({ clock: 5400, period: 2 }, "second_half", 94, at)?.seconds,
    ).toBe(5580);
  });
});
