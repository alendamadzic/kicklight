import { describe, expect, test } from "bun:test";
import fixture from "./feed/__fixtures__/espn-cov-new.json";
import { parseEspnSummary } from "./feed/espn";
import { EMPTY_SIDE_STATS, type MatchEvent, type MatchSnapshot } from "./model";
import { initialState, tick } from "./runner";
import { pickAuto } from "./stats/auto";

const snap = (over: Partial<MatchSnapshot> = {}): MatchSnapshot => {
  const team = (id: string) => ({
    id,
    name: id,
    short: id,
    color: "#f00",
    alternateColor: "#fff",
  });
  return {
    id: "m",
    league: "eng.1",
    phase: "first_half",
    minute: 30,
    home: team("H"),
    away: team("A"),
    score: { home: 0, away: 0 },
    stats: {
      home: { ...EMPTY_SIDE_STATS, possession: 60 },
      away: { ...EMPTY_SIDE_STATS, possession: 40 },
    },
    ...over,
  };
};
const goal = (
  id: string,
  wallclock: number,
  side: "home" | "away" = "home",
): MatchEvent => ({
  id,
  type: "goal",
  side,
  minute: 30,
  wallclock,
});

describe("runner", () => {
  const NOW = 1_000_000_000_000;

  test("a goal is scheduled at wallclock + TV delay", () => {
    const r = tick(initialState(), {
      snapshot: snap(),
      events: [goal("g1", NOW - 2_000)],
      now: NOW,
      delayMs: 35_000,
      horizonMs: 60_000,
    });
    const fx = r.commands.find((c) => c.item.kind === "effect");
    expect(fx?.at).toBe(NOW - 2_000 + 35_000);
    expect(fx?.item).toEqual({
      kind: "effect",
      effect: "goal",
      side: "home",
      minute: 30,
    });
  });

  test("the same event is never scheduled twice across ticks", () => {
    const input = {
      snapshot: snap(),
      events: [goal("g1", NOW)],
      now: NOW,
      delayMs: 0,
      horizonMs: 60_000,
    };
    const a = tick(initialState(), input);
    const b = tick(a.state, { ...input, now: NOW + 10_000 });
    const goals = [...a.commands, ...b.commands].filter(
      (c) => c.item.kind === "effect" && c.item.effect === "goal",
    );
    expect(goals).toHaveLength(1);
  });

  test("a goal that already landed on TV long ago is dropped, not replayed", () => {
    const r = tick(initialState(), {
      snapshot: snap(),
      events: [goal("old", NOW - 600_000)],
      now: NOW,
      delayMs: 5_000,
      horizonMs: 60_000,
    });
    expect(r.commands.some((c) => c.item.kind === "effect")).toBe(false);
  });

  test("a goal the feed publishes late still fires, right away", () => {
    const input = { snapshot: snap(), delayMs: 0, horizonMs: 0 };
    const first = tick(initialState(), { ...input, events: [], now: NOW });
    // ESPN posts the goal 40s after its wallclock.
    const r = tick(first.state, {
      ...input,
      events: [goal("late", NOW)],
      now: NOW + 40_000,
    });
    const fx = r.commands.find((c) => c.item.kind === "effect");
    expect(fx?.at).toBe(NOW + 40_000);
  });

  test("an event the feed re-posts under a new id fires once; a real second goal still fires", () => {
    const input = { snapshot: snap(), delayMs: 0, horizonMs: 60_000 };
    const card = (id: string, minute: number): MatchEvent => ({
      id,
      type: "yellow_card",
      side: "away",
      minute,
      wallclock: NOW,
    });
    const a = tick(initialState(), {
      ...input,
      events: [card("c-seq-57", 32), goal("k1", NOW)],
      now: NOW,
    });
    // 20 s later ESPN attaches the play: same card, new id. And a second, real goal.
    const b = tick(a.state, {
      ...input,
      events: [
        card("c-seq-57", 32),
        card("c54147949", 32),
        goal("k1", NOW),
        goal("k2", NOW + 20_000),
      ],
      now: NOW + 20_000,
    });
    const fired = [...a.commands, ...b.commands].flatMap((c) =>
      c.item.kind === "effect" ? [c.item.effect] : [],
    );
    expect(fired.filter((f) => f === "yellow_card")).toHaveLength(1);
    expect(fired.filter((f) => f === "goal")).toHaveLength(2);
  });

  test("a goal FotMob reports first fires once, even when ESPN's copy says a minute earlier", () => {
    // Villa v City, 24 Oct: scored 12:39:52; FotMob had it at 12:40:10 (as 53'), ESPN at
    // 12:40:52 (as 52'). Placed by FotMob's lag, it lands about when the TV, 40 s behind, shows it.
    const scored = Date.parse("2026-10-24T12:39:52Z");
    const input = { snapshot: snap(), delayMs: 40_000, horizonMs: 60_000 };
    const fotmob: MatchEvent = {
      id: "f14625674",
      type: "goal",
      side: "away",
      minute: 53,
      wallclock: scored + 18_000 - 15_000,
      source: "fotmob",
    };
    const espn: MatchEvent = {
      id: "k54149975",
      type: "goal",
      side: "away",
      minute: 52,
      wallclock: scored,
    };
    const first = tick(
      { ...initialState(), started: true },
      { ...input, events: [fotmob], now: scored + 18_000 },
    );
    const later = tick(first.state, {
      ...input,
      events: [fotmob, espn],
      now: scored + 61_000,
    });
    const goals = [...first.commands, ...later.commands].filter(
      (c) => c.item.kind === "effect" && c.item.effect === "goal",
    );
    expect(goals).toHaveLength(1);
    expect(Math.abs(goals[0].at - (scored + 40_000))).toBeLessThanOrEqual(
      5_000,
    );
  });

  test("an own goal lights the other team's colour", () => {
    const r = tick(initialState(), {
      snapshot: snap(),
      events: [
        {
          id: "og",
          type: "own_goal",
          side: "home",
          minute: 10,
          wallclock: NOW,
        },
      ],
      now: NOW,
      delayMs: 0,
      horizonMs: 1_000,
    });
    expect(r.commands.find((c) => c.item.kind === "effect")?.item).toEqual({
      kind: "effect",
      effect: "goal",
      side: "away",
      minute: 10,
    });
  });

  test("split lands now on the first tick, then is only re-sent when it moves a point, delayed", () => {
    const first = tick(initialState("possession"), {
      snapshot: snap(),
      events: [],
      now: NOW,
      delayMs: 20_000,
      horizonMs: 30_000,
    });
    const split = first.commands.find((c) => c.item.kind === "split");
    expect(split?.item).toEqual({ kind: "split", homeShare: 0.6 });
    expect(split?.at).toBe(NOW);

    const second = tick(first.state, {
      snapshot: snap(),
      events: [],
      now: NOW + 10_000,
      delayMs: 20_000,
      horizonMs: 30_000,
    });
    expect(second.commands.some((c) => c.item.kind === "split")).toBe(false);

    const moved = tick(second.state, {
      snapshot: snap({
        stats: {
          home: { ...EMPTY_SIDE_STATS, possession: 70 },
          away: { ...EMPTY_SIDE_STATS, possession: 30 },
        },
      }),
      events: [],
      now: NOW + 20_000,
      delayMs: 20_000,
      horizonMs: 30_000,
    });
    expect(moved.commands.find((c) => c.item.kind === "split")?.at).toBe(
      NOW + 40_000,
    );
  });

  test("switching stat lands now, drops the old stat's queued splits, and re-sends", () => {
    const input = { snapshot: snap(), events: [], delayMs: 20_000 };
    // Mid-session, so the split queues behind the delay.
    const first = tick(
      { ...initialState("possession"), started: true },
      { ...input, now: NOW },
    );
    expect(first.state.pending.map((q) => q.item.kind)).toEqual(["split"]);

    const toClock = tick(
      { ...first.state, stat: "clock" },
      { ...input, now: NOW + 1_000 },
    );
    expect(toClock.commands.map((c) => [c.item.kind, c.at])).toEqual([
      ["fill", NOW + 1_000],
    ]);
    expect(toClock.state.pending).toHaveLength(0);

    // Back to the same share: still re-sent, since the strip is showing the clock.
    const back = tick(
      { ...toClock.state, stat: "possession" },
      { ...input, now: NOW + 2_000 },
    );
    expect(back.commands.map((c) => c.item)).toEqual([
      { kind: "split", homeShare: 0.6 },
    ]);
  });

  test("nothing is sent before kick-off", () => {
    const r = tick(initialState(), {
      snapshot: snap({ phase: "scheduled", minute: null }),
      events: [],
      now: NOW,
      delayMs: 0,
      horizonMs: 60_000,
    });
    expect(r.commands).toHaveLength(0);
  });

  test("full time schedules a single restore after the hold", () => {
    const input = {
      snapshot: snap({ phase: "full_time", minute: 90 }),
      events: [] as MatchEvent[],
      now: NOW,
      delayMs: 10_000,
      horizonMs: 120_000,
    };
    const a = tick(initialState(), input);
    const b = tick(a.state, { ...input, now: NOW + 10_000 });
    const restores = [...a.commands, ...b.commands].filter(
      (c) => c.item.kind === "restore",
    );
    expect(restores).toHaveLength(1);
    expect(restores[0].at).toBe(NOW + 10_000 + 30_000);
  });

  test("stoppage time of a one-goal game breathes", () => {
    const r = tick(initialState(), {
      snapshot: snap({
        phase: "second_half",
        minute: 92,
        score: { home: 1, away: 0 },
      }),
      events: [],
      now: NOW,
      delayMs: 0,
      horizonMs: 20_000,
    });
    expect(
      r.commands.some(
        (c) => c.item.kind === "effect" && c.item.effect === "nerves",
      ),
    ).toBe(true);
  });

  test("clock mode fills with the leader's side", () => {
    const r = tick(initialState("clock"), {
      snapshot: snap({ minute: 45, score: { home: 0, away: 1 } }),
      events: [],
      now: NOW,
      delayMs: 0,
      horizonMs: 1_000,
    });
    expect(r.commands[0].item).toEqual({
      kind: "fill",
      fraction: 0.5,
      lead: "away",
    });
  });
});

describe("auto-director", () => {
  const ctx = (snapshot: MatchSnapshot) => ({
    snapshot,
    events: [] as MatchEvent[],
  });
  test("quiet middle of the game follows possession", () => {
    expect(pickAuto(ctx(snap({ minute: 30 })), null, 0).key).toBe("possession");
  });
  test("the last ten minutes of a close game follow the scoreline", () => {
    expect(
      pickAuto(ctx(snap({ minute: 85, score: { home: 1, away: 1 } })), null, 0)
        .key,
    ).toBe("scoreline");
  });
  test("holds a choice for a minute before switching", () => {
    const first = pickAuto(ctx(snap({ minute: 30 })), null, 0);
    const held = pickAuto(ctx(snap({ minute: 85 })), first, 30_000);
    expect(held.key).toBe("possession");
    expect(pickAuto(ctx(snap({ minute: 85 })), first, 61_000).key).toBe(
      "scoreline",
    );
  });
});

describe("replay of a real match", () => {
  test("every goal in the feed becomes exactly one goal effect, with no spurious extras", () => {
    const { snapshot, events } = parseEspnSummary(fixture, "eng.1");
    const delay = 30_000;
    let state = initialState("possession");
    const out: string[] = [];
    // Tick every 10s from before the first event to well after the last, as the cloud cron would.
    const start = events[0].wallclock - 5_000;
    const end = events[events.length - 1].wallclock + delay + 60_000;
    for (let now = start; now < end; now += 10_000) {
      const r = tick(state, {
        snapshot: { ...snapshot, phase: "second_half", minute: 60 },
        events: events.filter((e) => e.wallclock <= now),
        now,
        delayMs: delay,
        horizonMs: 10_000,
      });
      state = r.state;
      for (const c of r.commands) {
        if (c.item.kind === "effect" && c.item.effect === "goal")
          out.push(`${c.at}`);
      }
    }
    const goals = events.filter((e) => e.type === "goal");
    expect(out).toHaveLength(goals.length);
    expect(new Set(out).size).toBe(goals.length);
  });
});
