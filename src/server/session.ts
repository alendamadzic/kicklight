import type { Rgb } from "@/engine/colors";
import { pickStripColors } from "@/engine/colors";
import { EFFECTS } from "@/engine/effects";
import type { ParsedMatch } from "@/engine/feed/espn";
import { replayAt } from "@/engine/feed/replay";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { MatchSnapshot } from "@/engine/model";
import {
  type Command,
  initialState,
  type RunnerState,
  tick,
} from "@/engine/runner";
import type { Scheduled } from "@/engine/scheduler";
import type { StatKey } from "@/engine/stats";
import type { MirroredCommand, SessionMirror } from "@/lib/api-types";
import { playFrames } from "@/lights/play";
import { fillPoints, restingFromRecent, splitPoints } from "@/lights/render";
import type { LightTransport } from "@/lights/transport";

// One pass over one session: poll the feed every few seconds, run the brain, drive the
// lights, and say what to write back. Pure of I/O except through `deps`, so it is the same
// code in the cloud cron tick, the local loop and the tests.

export interface SessionRow {
  id: string;
  league: string;
  event_id: string;
  stat: string;
  status: "active" | "paused" | "ended";
  delay_ms: number;
  runner_state: Partial<RunnerState> & { recent?: MirroredCommand[] };
  light_snapshot: unknown;
  /** ms since epoch. */
  created_at: number;
}

export interface SessionDeps {
  transport: LightTransport;
  /** Live feed. Replay sessions don't call this. */
  fetchMatch: (league: string, eventId: string) => Promise<ParsedMatch>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Show the viewer what's coming mid-pass, so the virtual strip keeps time with the real one. */
  publish?: (mirror: SessionMirror) => Promise<void>;
}

export interface SessionUpdate {
  runner_state: SessionRow["runner_state"];
  snapshot: SessionMirror;
  light_snapshot: unknown;
  status: SessionRow["status"];
  /** ms since epoch. */
  next_due_at: number;
  ended: boolean;
}

export interface SessionResult {
  update: SessionUpdate;
  executed: Scheduled<Command>[];
  errors: string[];
}

export const HORIZON_MS = 10_000;
/** While the ball is in play the feed is re-read this often within a pass. */
export const POLL_MS = 3_000;
/** No new poll starts after this far into a pass. */
export const PASS_MS = 12_000;
/**
 * No command starts after this far into a pass; it goes back in the queue for the next one.
 * Keeps a pass, effects and all, inside the cron route's time limit.
 */
export const BUDGET_MS = 20_000;
const IN_PLAY: ReadonlySet<MatchSnapshot["phase"]> = new Set([
  "first_half",
  "second_half",
  "extra_time",
  "shootout",
]);
/** Replay sessions run a scenario at one match minute per real second. */
export const REPLAY_MINUTE_MS = 1_000;
const LEAD_IN_MS = 2_000;
/** Mirrored commands kept per kind: resting ones churn every tick and mustn't push effects out. */
const RECENT_KEEP = 20;

/** The last RECENT_KEEP effects and the last RECENT_KEEP resting commands, in time order. */
export function trimRecent(recent: MirroredCommand[]): MirroredCommand[] {
  const effects = recent.filter((c) => c.kind === "effect");
  const resting = recent.filter((c) => c.kind !== "effect");
  return [...effects.slice(-RECENT_KEEP), ...resting.slice(-RECENT_KEEP)].sort(
    (a, b) => a.at - b.at,
  );
}

function replayFeed(row: SessionRow, now: number): ParsedMatch {
  const script = SCENARIOS.find((s) => s.id === row.event_id);
  if (!script) throw new Error(`Unknown replay scenario: ${row.event_id}`);
  const minuteAt = (ms: number) =>
    (ms - row.created_at - LEAD_IN_MS) / REPLAY_MINUTE_MS;
  const wallclock = (minute: number) =>
    row.created_at + LEAD_IN_MS + minute * REPLAY_MINUTE_MS;

  // The scoreboard is "now"; events are looked up one polling window ahead so each
  // effect is scheduled for exactly its moment instead of up to a window late.
  const current = replayAt(script, minuteAt(now), row.created_at);
  const ahead = replayAt(script, minuteAt(now + HORIZON_MS), row.created_at);
  // Compress match minutes onto real seconds so a whole match plays in about 95 s.
  const events = ahead.events.map((e) => ({
    ...e,
    wallclock: wallclock(e.minute),
  }));
  return { snapshot: current.snapshot, events };
}

function nextDue(
  snapshot: MatchSnapshot,
  now: number,
  hasPending: boolean,
): number {
  switch (snapshot.phase) {
    case "scheduled": {
      const k = snapshot.kickoff;
      const soon = k ? k - 60_000 : now + 300_000;
      return Math.max(now + 30_000, Math.min(now + 300_000, soon));
    }
    case "half_time":
      return now + 30_000;
    case "full_time":
      return hasPending ? now + HORIZON_MS : now + 60_000;
    default:
      return now + HORIZON_MS;
  }
}

function mirrorOf(cmd: Command, at: number): MirroredCommand {
  switch (cmd.kind) {
    case "split":
      return { at, kind: "split", homeShare: cmd.homeShare };
    case "fill":
      return { at, kind: "fill", fraction: cmd.fraction, lead: cmd.lead };
    case "effect":
      return {
        at,
        kind: "effect",
        effect: cmd.effect,
        side: cmd.side,
        minute: cmd.minute,
      };
    case "restore":
      return { at, kind: "restore" };
  }
}

export async function processSession(
  row: SessionRow,
  deps: SessionDeps,
): Promise<SessionResult> {
  const { transport, now, sleep } = deps;
  const errors: string[] = [];
  const t0 = now();
  const read = (at: number) =>
    row.league === "replay"
      ? Promise.resolve(replayFeed(row, at))
      : deps.fetchMatch(row.league, row.event_id);

  // Remember how the strip looked before kick-off, once.
  let lightSnapshot = row.light_snapshot;
  if (lightSnapshot == null) {
    try {
      lightSnapshot = await transport.snapshot();
    } catch (e) {
      errors.push(`snapshot: ${(e as Error).message}`);
    }
  }

  let state: RunnerState = {
    ...initialState(row.stat as StatKey),
    ...(row.runner_state as Partial<RunnerState>),
    stat: row.stat as StatKey,
  };
  const recent = [...(row.runner_state.recent ?? [])];
  const executed: Scheduled<Command>[] = [];
  let status: SessionRow["status"] = row.status;
  let ended = false;
  let parsed: ParsedMatch | null = null;
  let colors: { home: Rgb; away: Rgb } | null = null;
  let activeStat = state.stat;
  // Effects play over this and settle back onto it.
  let resting: Rgb[] | null = null;

  const mirrorNow = (): SessionMirror => ({
    match: (parsed as ParsedMatch).snapshot,
    stat: row.stat as StatKey,
    activeStat,
    colors: colors as { home: Rgb; away: Rgb },
    recent: trimRecent(recent),
    updatedAt: now(),
  });

  // While the ball is in play, re-read the feed every POLL_MS so an event is acted on within
  // seconds of ESPN publishing it. Each poll runs the commands due before the next one; the
  // last poll also covers the gap until the next pass is claimed.
  for (;;) {
    const pollAt = now();
    try {
      parsed = await read(pollAt);
    } catch (e) {
      // A failed first read fails the pass; a later one just ends it early.
      if (!parsed) throw e;
      errors.push(`feed: ${(e as Error).message}`);
      break;
    }
    const last =
      pollAt + POLL_MS >= t0 + PASS_MS || !IN_PLAY.has(parsed.snapshot.phase);
    const horizonMs = last ? HORIZON_MS : POLL_MS;
    const strip = pickStripColors(parsed.snapshot.home, parsed.snapshot.away);
    colors = { home: strip.home as Rgb, away: strip.away as Rgb };
    resting ??= restingFromRecent(recent, transport.points, colors);
    const score = parsed.snapshot.score;
    const winner =
      score.home > score.away
        ? "home"
        : score.away > score.home
          ? "away"
          : null;

    const result = tick(state, {
      snapshot: parsed.snapshot,
      events: parsed.events,
      now: pollAt,
      delayMs: row.delay_ms,
      horizonMs,
    });
    state = result.state;
    activeStat = result.activeStat;

    // Mirror what's coming before playing it, so the viewer's strip starts it on time too.
    const mirrored = new Map(
      result.commands.map((c) => [c, mirrorOf(c.item, c.at)] as const),
    );
    if (result.commands.length) {
      recent.push(...mirrored.values());
      await deps.publish?.(mirrorNow()).catch((e) => {
        errors.push(`publish: ${(e as Error).message}`);
      });
    }

    for (const [i, c] of result.commands.entries()) {
      if (now() >= t0 + BUDGET_MS) {
        // Out of time: hand the rest to the next pass instead of overrunning the route.
        const rest = result.commands.slice(i);
        state = {
          ...state,
          pending: [...rest, ...state.pending].sort(
            (a, b) => a.at - b.at || a.seq - b.seq,
          ),
        };
        for (const r of rest) {
          const m = mirrored.get(r);
          if (m) recent.splice(recent.indexOf(m), 1);
        }
        break;
      }
      const wait = c.at - now();
      if (wait > 0) await sleep(Math.min(wait, HORIZON_MS));
      const cmd = c.item;
      executed.push(c);
      try {
        if (cmd.kind !== "restore" && transport.applyCommand) {
          const handled = await transport
            .applyCommand(cmd, colors)
            .catch((e) => {
              errors.push(`stream: ${(e as Error).message}`);
              return false;
            });
          if (handled) continue;
        }
        if (cmd.kind === "split") {
          resting = splitPoints(cmd.homeShare, transport.points, colors);
          await transport.setGradient(resting, 1500);
        } else if (cmd.kind === "fill") {
          resting = fillPoints(
            cmd.fraction,
            cmd.lead,
            transport.points,
            colors,
          );
          await transport.setGradient(resting, 800);
        } else if (cmd.kind === "effect") {
          // The same frames the virtual strip draws, as REST keyframes. An effect that
          // queued behind another in this pass joins at the point the virtual strip has
          // reached. Lateness from before this pass started (it fell between two passes)
          // doesn't count: the effect would otherwise be "already over" and never play.
          const fx = EFFECTS[cmd.effect];
          if (fx)
            await playFrames(
              transport,
              fx,
              { ...colors, side: cmd.side, winner },
              resting,
              sleep,
              now() - Math.max(c.at, t0),
            );
        } else if (cmd.kind === "restore") {
          await transport.restore(lightSnapshot);
          status = "ended";
          ended = true;
        }
      } catch (e) {
        errors.push(`${cmd.kind}: ${(e as Error).message}`);
      }
    }
    if (parsed.snapshot.phase === "suspended") {
      status = "ended";
      ended = true;
    }
    if (ended || last) break;
    const until = pollAt + POLL_MS - now();
    if (until > 0) await sleep(until);
  }

  const after = now();
  const mirror = mirrorNow();
  const snapshot = (parsed as ParsedMatch).snapshot;
  return {
    update: {
      runner_state: { ...state, recent: mirror.recent },
      snapshot: mirror,
      light_snapshot: lightSnapshot ?? null,
      status,
      // In play, a pass already polled right up to now, so the next is due straight away.
      // Otherwise wait as long as the phase allows, counted from when this pass started.
      next_due_at: ended
        ? after
        : IN_PLAY.has(snapshot.phase)
          ? after
          : row.league === "replay"
            ? t0 + HORIZON_MS
            : nextDue(snapshot, t0, state.pending.length > 0),
      ended,
    },
    executed,
    errors,
  };
}
