import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import type { SignalFallback } from "@/engine/effects";
import type { ParsedMatch } from "@/engine/feed/espn";
import {
  EMPTY_SIDE_STATS,
  type MatchEvent,
  type MatchSnapshot,
} from "@/engine/model";
import type { LightTransport } from "@/lights/transport";
import {
  BUDGET_MS,
  PASS_MS,
  POLL_MS,
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

const team = (id: string, color: string) => ({
  id,
  name: id,
  short: id,
  color,
  alternateColor: "#ffffff",
});

/** A live match as the feed reports it. */
const liveMatch = (
  phase: MatchSnapshot["phase"],
  events: MatchEvent[] = [],
): ParsedMatch => ({
  snapshot: {
    id: "m1",
    league: "eng.1",
    phase,
    minute: phase === "half_time" ? 45 : 60,
    home: team("HOM", "#cc0000"),
    away: team("AWA", "#0000cc"),
    score: { home: 0, away: 0 },
    stats: {
      home: { ...EMPTY_SIDE_STATS, possession: 55 },
      away: { ...EMPTY_SIDE_STATS, possession: 45 },
    },
  },
  events,
});

const liveRow = (
  h: ReturnType<typeof harness>,
  over: Partial<SessionRow> = {},
): SessionRow => ({
  ...base(h.now() - 60_000),
  league: "eng.1",
  event_id: "m1",
  light_snapshot: { saved: true },
  ...over,
});

describe("processSession (replay)", () => {
  test("first cycle snapshots the strip, sets a split, mirrors the match, and schedules the next poll", async () => {
    const h = harness();
    const row = base(h.now() - 30_000); // 28 s of match time have passed
    const r = await processSession(row, h.deps);
    expect(h.log[0]).toBe("snapshot");
    expect(h.grads.length).toBeGreaterThan(0);
    expect(r.update.light_snapshot).toEqual({ saved: true });
    expect(r.update.snapshot.match.score).toEqual({ home: 1, away: 0 });
    expect(r.update.snapshot.colors.home).toBeDefined();
    // In play the pass polled right up to its end, so the next one is due straight away.
    expect(r.update.next_due_at).toBe(h.now());
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
    const scores: string[] = [];
    h.deps.publish = async (m) => {
      scores.push(`${m.match.score.home}-${m.match.score.away}`);
    };
    const r = await processSession(base(created), h.deps);
    expect(r.update.next_due_at).toBe(h.now());
    const goal = r.executed.find(
      (c) => c.item.kind === "effect" && c.item.effect === "goal",
    );
    expect(goal?.at).toBe(created + 2_000 + 24 * 1_000);
    expect(h.signals).toHaveLength(0);
    // When the goal was queued the scoreboard still showed the present, not the look-ahead.
    expect(scores[0]).toBe("0-0");
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
    // Half time with nothing new in the feed, so only the queued effect touches the strip.
    h.deps.fetchMatch = async () => liveMatch("half_time");
    const row = liveRow(h, {
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
    });
    await processSession(row, h.deps);
    // A 2.4 s animation at ~3 keyframes a second, then back to rest.
    expect(h.grads.length).toBeGreaterThan(5);
  });

  test("in play, a pass re-reads the feed every few seconds and is due again as it ends", async () => {
    const h = harness();
    let reads = 0;
    h.deps.fetchMatch = async () => {
      reads++;
      return liveMatch("second_half");
    };
    const t0 = h.now();
    const r = await processSession(liveRow(h), h.deps);
    expect(reads).toBe(PASS_MS / POLL_MS);
    expect(h.now() - t0).toBeLessThanOrEqual(BUDGET_MS);
    expect(r.update.next_due_at).toBe(h.now());
  });

  test("an event published mid-pass lights the strip at the next poll, not the next pass", async () => {
    const h = harness();
    const t0 = h.now();
    let seenAt: number | null = null;
    h.deps.fetchMatch = async () => {
      // ESPN publishes a yellow card 7 s into the pass, a minute after it happened.
      if (h.now() - t0 < 7_000) return liveMatch("second_half");
      seenAt ??= h.now();
      return liveMatch("second_half", [
        {
          id: "k1",
          type: "yellow_card",
          side: "away",
          minute: 60,
          wallclock: t0 - 60_000,
        },
      ]);
    };
    const row = liveRow(h, { runner_state: { started: true } });
    const r = await processSession(row, h.deps);
    const card = r.executed.find(
      (c) => c.item.kind === "effect" && c.item.effect === "yellow_card",
    );
    expect(card).toBeDefined();
    expect(seenAt).not.toBeNull();
    expect((card?.at ?? 0) - (seenAt ?? 0)).toBeLessThanOrEqual(POLL_MS);
  });

  test("upcoming commands are published before they play, so the viewer's strip keeps time", async () => {
    const h = harness();
    const published: number[] = [];
    h.deps.publish = async (m) => {
      published.push(h.grads.length);
      expect(m.recent.some((c) => c.kind === "effect")).toBe(true);
    };
    h.deps.fetchMatch = async () => liveMatch("half_time");
    const row = liveRow(h, {
      runner_state: {
        started: true,
        pending: [
          {
            at: h.now() + 1_000,
            seq: 0,
            item: { kind: "effect", effect: "goal", side: "home" },
          },
        ],
      },
    });
    await processSession(row, h.deps);
    // Published once, before the first keyframe went to the strip.
    expect(published).toEqual([0]);
  });

  test("a pass that runs out of time hands the rest back instead of overrunning", async () => {
    const h = harness();
    h.deps.fetchMatch = async () => liveMatch("second_half");
    const t0 = h.now();
    const goal = (at: number, seq: number) => ({
      at: t0 + at,
      seq,
      item: {
        kind: "effect" as const,
        effect: "goal" as const,
        side: "home" as const,
      },
    });
    // The first goal plays until past the budget, so the second would overrun the route.
    const r = await processSession(
      liveRow(h, {
        runner_state: {
          started: true,
          pending: [goal(18_500, 0), goal(18_900, 1)],
        },
      }),
      h.deps,
    );
    const played = r.executed.filter((c) => c.item.kind === "effect");
    expect(played.map((c) => c.at)).toEqual([t0 + 18_500]);
    expect(r.update.runner_state.pending?.map((c) => c.at)).toEqual([
      t0 + 18_900,
    ]);
    // The mirror only shows what actually played; the rest is mirrored when it does.
    expect(
      r.update.snapshot.recent.filter((c) => c.kind === "effect"),
    ).toHaveLength(1);
    expect(h.now() - t0).toBeLessThan(BUDGET_MS + 7_000);
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
