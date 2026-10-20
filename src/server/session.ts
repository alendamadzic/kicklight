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
import { fillPoints, splitPoints } from "@/lights/render";
import type { LightTransport } from "@/lights/transport";

// One pass over one session: poll the feed, run the brain, drive the lights,
// and say what to write back. Pure of I/O except through `deps`, so it is the same
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
/** Replay sessions run a scenario at one match minute per real second. */
export const REPLAY_MINUTE_MS = 1_000;
const LEAD_IN_MS = 2_000;
const RECENT_KEEP = 20;

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
      return { at, kind: "effect", effect: cmd.effect, side: cmd.side };
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

  const parsed =
    row.league === "replay"
      ? replayFeed(row, t0)
      : await deps.fetchMatch(row.league, row.event_id);

  // Remember how the strip looked before kick-off, once.
  let lightSnapshot = row.light_snapshot;
  if (lightSnapshot == null) {
    try {
      lightSnapshot = await transport.snapshot();
    } catch (e) {
      errors.push(`snapshot: ${(e as Error).message}`);
    }
  }

  const prev: RunnerState = {
    ...initialState(row.stat as StatKey),
    ...(row.runner_state as Partial<RunnerState>),
    stat: row.stat as StatKey,
  };
  const result = tick(prev, {
    snapshot: parsed.snapshot,
    events: parsed.events,
    now: t0,
    delayMs: row.delay_ms,
    horizonMs: HORIZON_MS,
  });

  const strip = pickStripColors(parsed.snapshot.home, parsed.snapshot.away);
  const colors = { home: strip.home as Rgb, away: strip.away as Rgb };
  const recent = [...(row.runner_state.recent ?? [])];
  let status: SessionRow["status"] = row.status;
  let ended = false;

  for (const c of result.commands) {
    const wait = c.at - now();
    if (wait > 0) await sleep(Math.min(wait, HORIZON_MS));
    const cmd = c.item;
    try {
      if (cmd.kind !== "restore" && transport.applyCommand) {
        const handled = await transport.applyCommand(cmd, colors).catch((e) => {
          errors.push(`stream: ${(e as Error).message}`);
          return false;
        });
        if (handled) {
          recent.push(mirrorOf(cmd, c.at));
          continue;
        }
      }
      if (cmd.kind === "split") {
        await transport.setGradient(
          splitPoints(cmd.homeShare, transport.points, colors),
          1500,
        );
      } else if (cmd.kind === "fill") {
        await transport.setGradient(
          fillPoints(cmd.fraction, cmd.lead, transport.points, colors),
          800,
        );
      } else if (cmd.kind === "effect") {
        const fx = EFFECTS[cmd.effect];
        const sig = fx?.signal?.({
          home: colors.home,
          away: colors.away,
          side: cmd.side,
          winner: null,
        });
        if (sig && transport.signal) await transport.signal(sig);
      } else if (cmd.kind === "restore") {
        await transport.restore(lightSnapshot);
        status = "ended";
        ended = true;
      }
    } catch (e) {
      errors.push(`${cmd.kind}: ${(e as Error).message}`);
    }
    recent.push(mirrorOf(cmd, c.at));
  }
  if (parsed.snapshot.phase === "suspended") {
    status = "ended";
    ended = true;
  }

  const after = now();
  const mirror: SessionMirror = {
    match: parsed.snapshot,
    stat: row.stat as StatKey,
    activeStat: result.activeStat,
    colors,
    recent: recent.slice(-RECENT_KEEP),
    updatedAt: after,
  };

  return {
    update: {
      runner_state: { ...result.state, recent: mirror.recent },
      snapshot: mirror,
      light_snapshot: lightSnapshot ?? null,
      status,
      next_due_at: ended
        ? after
        : row.league === "replay"
          ? after + HORIZON_MS
          : nextDue(parsed.snapshot, after, result.state.pending.length > 0),
      ended,
    },
    executed: result.commands,
    errors,
  };
}
