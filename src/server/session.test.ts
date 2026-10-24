import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import type { SignalFallback } from "@/engine/effects";
import { EMPTY_SIDE_STATS } from "@/engine/model";
import type { LightTransport } from "@/lights/transport";
import {
  processSession,
  type SessionDeps,
  type SessionRow,
  trimRecent,
} from "./session";

function harness(startMs = 1_000_000) {
  let clock = startMs;
  const log: string[] = [];
  const grads: Rgb[][] = [];
  const signals: SignalFallback[] = [];
  const transport: LightTransport = {
    kind: "remote",
    points: 5,
    setGradient: async (c) => {
      grads.push(c);
      log.push("gradient");
    },
    signal: async (s) => {
      signals.push(s);
      log.push(`signal:${s.signal}`);
    },
    snapshot: async () => {
      log.push("snapshot");
      return { saved: true };
    },
    restore: async () => {
      log.push("restore");
    },
  };
  const deps: SessionDeps = {
    transport,
    fetchMatch: async () => {
      throw new Error("live feed should not be used for replays");
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  const advance = (ms: number) => {
    clock += ms;
  };
  return { deps, log, grads, signals, advance, now: () => clock };
}

const base = (created: number): SessionRow => ({
  id: "s1",
  league: "replay",
  event_id: "derby-day",
  stat: "possession",
  status: "active",
  delay_ms: 0,
  runner_state: {},
  light_snapshot: null,
  created_at: created,
});

describe("processSession (replay)", () => {
  test("first cycle snapshots the strip, sets a split, mirrors the match, and schedules the next poll", async () => {
    const h = harness();
    const row = base(h.now() - 30_000); // 28 s of match time have passed
    const t0 = h.now();
    const r = await processSession(row, h.deps);
    expect(h.log[0]).toBe("snapshot");
    expect(h.grads.length).toBeGreaterThan(0);
    expect(r.update.light_snapshot).toEqual({ saved: true });
    expect(r.update.snapshot.match.score).toEqual({ home: 1, away: 0 });
    expect(r.update.snapshot.colors.home).toBeDefined();
    expect(r.update.next_due_at).toBe(t0 + 10_000);
    expect(r.update.status).toBe("active");
  });

  test("a goal plays its animation on the strip, once, across cycles", async () => {
    const h = harness();
    const created = h.now() - 26_000; // goal is at match minute 24 → 26 s in
    let row = base(created);
    const first = await processSession(row, h.deps);
    row = {
      ...row,
      runner_state: first.update.runner_state,
      light_snapshot: first.update.light_snapshot,
    };
    h.advance(10_000);
    const second = await processSession(row, h.deps);
    const goals = [...first.executed, ...second.executed].filter(
      (c) =>
        c.item.kind === "effect" &&
        c.item.effect === "goal" &&
        c.at === created + 26_000,
    );
    expect(goals).toHaveLength(1);
    // 6.5 s of keyframes at ~3 a second, then back to the resting split.
    expect(h.grads.length).toBeGreaterThan(20);
    expect(h.signals).toHaveLength(0);
  });

  test("replays poll every window and schedule a goal for exactly its moment, ahead of time", async () => {
    const h = harness();
    // 20 s in: the goal at match minute 24 is 6 s away, inside the 10 s look-ahead.
    const created = h.now() - 20_000;
    const t0 = h.now();
    const r = await processSession(base(created), h.deps);
    expect(r.update.next_due_at).toBe(t0 + 10_000);
    const goal = r.executed.find(
      (c) => c.item.kind === "effect" && c.item.effect === "goal",
    );
    expect(goal?.at).toBe(created + 2_000 + 24 * 1_000);
    expect(h.signals).toHaveLength(0);
    // The scoreboard still shows the present, not the look-ahead.
    expect(r.update.snapshot.match.score).toEqual({ home: 0, away: 0 });
  });

  test("a replay still in its lead-in is polled again in one window, not five minutes", async () => {
    const h = harness();
    const t0 = h.now();
    const r = await processSession(base(h.now() - 500), h.deps); // before match minute 0
    expect(r.update.snapshot.match.phase).toBe("scheduled");
    expect(r.update.next_due_at).toBe(t0 + 10_000);
  });

  test("the final whistle holds, then restores the strip and ends the session", async () => {
    const h = harness();
    const created = h.now() - 100_000; // past full time (95 min → 97 s)
    let row = base(created);
    let r = await processSession(row, h.deps);
    expect(r.update.ended).toBe(false);
    for (let i = 0; i < 6 && !r.update.ended; i++) {
      row = {
        ...row,
        runner_state: r.update.runner_state,
        light_snapshot: r.update.light_snapshot,
      };
      h.advance(10_000);
      r = await processSession(row, h.deps);
    }
    expect(r.update.ended).toBe(true);
    expect(r.update.status).toBe("ended");
    expect(h.log).toContain("restore");
  });

  test("a failing bridge call is reported but does not throw or stop the session", async () => {
    const h = harness();
    h.deps.transport.setGradient = async () => {
      throw new Error("bridge offline");
    };
    const r = await processSession(base(h.now() - 30_000), h.deps);
    expect(r.errors.some((e) => e.includes("bridge offline"))).toBe(true);
    expect(r.update.status).toBe("active");
  });

  test("a streaming transport renders commands itself; the REST path is the fallback", async () => {
    const h = harness();
    const applied: string[] = [];
    h.deps.transport.applyCommand = async (cmd) => {
      applied.push(cmd.kind);
      return true;
    };
    await processSession(base(h.now() - 30_000), h.deps);
    expect(applied).toContain("split");
    expect(h.grads).toHaveLength(0);

    const h2 = harness();
    h2.deps.transport.applyCommand = async () => false;
    await processSession(base(h2.now() - 30_000), h2.deps);
    expect(h2.grads.length).toBeGreaterThan(0);
  });

  test("an effect that fell between two ticks still plays in full", async () => {
    const h = harness();
    // A live match at half time with nothing new in the feed, so only the queued effect
    // touches the strip.
    const team = (id: string, color: string) => ({
      id,
      name: id,
      short: id,
      color,
      alternateColor: "#ffffff",
    });
    h.deps.fetchMatch = async () => ({
      snapshot: {
        id: "m1",
        league: "eng.1",
        phase: "half_time",
        minute: 45,
        home: team("HOM", "#cc0000"),
        away: team("AWA", "#0000cc"),
        score: { home: 0, away: 0 },
        stats: { home: EMPTY_SIDE_STATS, away: EMPTY_SIDE_STATS },
      },
      events: [],
    });
    const row: SessionRow = {
      ...base(h.now() - 60_000),
      league: "eng.1",
      event_id: "m1",
      light_snapshot: { saved: true },
      runner_state: {
        started: true,
        // Due 8 s ago: after the last pass's window closed, before this pass began.
        pending: [
          {
            at: h.now() - 8_000,
            seq: 0,
            item: { kind: "effect", effect: "free_kick", side: "home" },
          },
        ],
      },
    };
    await processSession(row, h.deps);
    // A 2.4 s animation at ~3 keyframes a second, then back to rest.
    expect(h.grads.length).toBeGreaterThan(5);
  });

  test("the next pass is due where this one's window ends, not a window after it finished", async () => {
    const h = harness();
    const t0 = h.now();
    // Mid-match, so this pass sleeps and plays effects well past its start.
    const r = await processSession(base(h.now() - 20_000), h.deps);
    expect(h.now()).toBeGreaterThan(t0 + 10_000);
    expect(r.update.next_due_at).toBe(t0 + 10_000);
  });

  test("an unknown scenario fails loudly", async () => {
    const h = harness();
    const row = { ...base(h.now()), event_id: "nope" };
    await expect(processSession(row, h.deps)).rejects.toThrow(
      "Unknown replay scenario",
    );
  });
});

describe("trimRecent", () => {
  test("a run of splits never pushes the last goal out of the mirror", () => {
    const goal = { at: 0, kind: "effect" as const, effect: "goal" as const };
    const splits = Array.from({ length: 50 }, (_, i) => ({
      at: i + 1,
      kind: "split" as const,
      homeShare: 0.5,
    }));
    const kept = trimRecent([goal, ...splits]);
    expect(kept[0]).toEqual(goal);
    expect(kept.filter((c) => c.kind === "split")).toHaveLength(20);
  });
});
