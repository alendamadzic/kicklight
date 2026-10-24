import { describe, expect, test } from "bun:test";
import {
  nextMoment,
  nextMomentMinute,
  timelineEnd,
  timelineMarkers,
} from "./moments";

describe("timelineMarkers", () => {
  test("keeps marked moments with a minute, oldest first, placed along the bar", () => {
    const m = timelineMarkers([
      { id: "g", effect: "goal", side: "home", minute: 63 },
      { id: "c", effect: "corner", side: "away", minute: 20 },
      { id: "y", effect: "yellow_card", side: "away", minute: 45 },
      { id: "x", effect: "goal", side: "away", minute: null },
    ]);
    expect(m.map((x) => x.id)).toEqual(["y", "g"]);
    expect(m[0].at).toBeCloseTo(0.5);
    expect(m[1].at).toBeCloseTo(0.7);
  });

  test("clamps late moments to the end of the bar", () => {
    const [m] = timelineMarkers(
      [{ id: "g", effect: "goal", side: "home", minute: 95 }],
      90,
    );
    expect(m.at).toBe(1);
  });

  test("the bar grows into added time", () => {
    expect(timelineEnd(30)).toBe(90);
    expect(timelineEnd(94.2)).toBe(95);
  });
});

describe("next moment", () => {
  const events = [
    { minute: 12, type: "corner" as const },
    { minute: 23, type: "goal" as const },
    { minute: 34, type: "yellow_card" as const },
  ];

  test("lands just before the next marked event", () => {
    expect(nextMomentMinute(events, 0)).toBeCloseTo(22.25);
    expect(nextMoment(events, 0)?.minute).toBe(23);
  });

  test("skips the moment you're already at", () => {
    expect(nextMoment(events, 22.25)?.minute).toBe(34);
  });

  test("null once nothing is left", () => {
    expect(nextMomentMinute(events, 40)).toBeNull();
    expect(nextMoment(events, 40)).toBeNull();
  });
});
