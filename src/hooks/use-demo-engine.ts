"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActiveEffect,
  composeFrame,
  restingFor,
  STRIP_POINTS,
  winnerOf,
} from "@/components/strip/compose";
import { pickStripColors, type Rgb } from "@/engine/colors";
import type { EffectKey } from "@/engine/effects";
import { type ReplayScript, replayAt } from "@/engine/feed/replay";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { MatchEvent, MatchSnapshot, Side } from "@/engine/model";
import {
  type Command,
  initialState,
  type RunnerState,
  tick,
} from "@/engine/runner";
import { STAT_MODES, type StatKey } from "@/engine/stats";
import type { TickerItem } from "@/lib/ticker";

export type DemoSpeed = 30 | 60 | 180;

export interface DemoUi {
  script: ReplayScript;
  minute: number;
  playing: boolean;
  ended: boolean;
  speed: DemoSpeed;
  stat: StatKey;
  /** The stat actually on the lights (resolves "auto"). */
  activeStat: StatKey;
  snapshot: MatchSnapshot;
  events: MatchEvent[];
  colors: { home: Rgb; away: Rgb; awaySwitched: boolean };
  share: number | null;
  values: [string, string] | null;
  ticker: TickerItem[];
}

/** What the engine tells the outside world (e.g. to mirror to the real strip). */
export type DemoCommand =
  | { kind: "resting"; cmd: Command; colors: { home: Rgb; away: Rgb } }
  | {
      kind: "effect";
      effect: EffectKey;
      side: Side | null;
      colors: { home: Rgb; away: Rgb };
    };

interface Engine {
  script: ReplayScript;
  startMs: number;
  minute: number;
  state: RunnerState;
  cmd: Command | null;
  resting: Rgb[];
  effects: ActiveEffect[];
  ticker: TickerItem[];
  stat: StatKey;
  activeStat: StatKey;
  playing: boolean;
  speed: DemoSpeed;
  dirty: boolean;
  seq: number;
  colors: ReturnType<typeof pickStripColors>;
  snapshot: MatchSnapshot;
  events: MatchEvent[];
}

const DEFAULT_SCRIPT = SCENARIOS[0];

function createEngine(
  script: ReplayScript,
  stat: StatKey,
  speed: DemoSpeed,
): Engine {
  const colors = pickStripColors(script.home, script.away);
  const startMs = Date.now();
  const { snapshot, events } = replayAt(script, 0, startMs);
  return {
    script,
    startMs,
    minute: 0,
    state: initialState(stat),
    cmd: null,
    resting: restingFor(null, STRIP_POINTS, colors),
    effects: [],
    ticker: [],
    stat,
    activeStat: stat,
    playing: false,
    speed,
    dirty: true,
    seq: 0,
    colors,
    snapshot,
    events,
  };
}

function pastTicker(eng: Engine): TickerItem[] {
  // Rebuild the feed for a seek: what already happened, newest first, no animation.
  return eng.events
    .filter(
      (e) =>
        e.type in
        {
          goal: 1,
          red_card: 1,
          yellow_card: 1,
          penalty_awarded: 1,
          penalty_missed: 1,
          var: 1,
        },
    )
    .slice(-6)
    .map((e, i) => ({
      id: `past-${e.id}-${i}`,
      effect: e.type as EffectKey,
      side: e.side,
      at: 0,
      minute: e.minute,
    }))
    .reverse();
}

/**
 * Runs a scripted match through the real engine in the browser. The match clock
 * is virtual (30x/60x/180x); effect animations run on the real clock. Everything
 * the strip needs is behind `frame`, so React doesn't re-render at 60fps.
 */
export function useDemoEngine(options?: {
  scenarioId?: string;
  stat?: StatKey;
  speed?: DemoSpeed;
  autoplay?: boolean;
  onCommand?: (c: DemoCommand) => void;
}) {
  const scenarioId = options?.scenarioId ?? DEFAULT_SCRIPT.id;
  const onCommandRef = useRef(options?.onCommand);
  useEffect(() => {
    onCommandRef.current = options?.onCommand;
  });

  // Only the scenario resets the engine; the other options seed it.
  const initRef = useRef({
    stat: options?.stat,
    speed: options?.speed,
    autoplay: options?.autoplay,
  });
  const engineRef = useRef<Engine | null>(null);
  const [ui, setUi] = useState<DemoUi | null>(null);

  const buildUi = useCallback((eng: Engine): DemoUi => {
    const ctx = { snapshot: eng.snapshot, events: eng.events };
    const key = eng.activeStat;
    const mode = key === "auto" || key === "clock" ? null : STAT_MODES[key];
    const share =
      eng.cmd?.kind === "split"
        ? eng.cmd.homeShare
        : mode
          ? mode.homeShare(ctx)
          : null;
    return {
      script: eng.script,
      minute: eng.minute,
      playing: eng.playing,
      ended: eng.minute >= eng.script.endMinute,
      speed: eng.speed,
      stat: eng.stat,
      activeStat: key,
      snapshot: eng.snapshot,
      events: eng.events,
      colors: eng.colors,
      share,
      values: mode?.values?.(ctx) ?? null,
      ticker: eng.ticker.slice(0, 30),
    };
  }, []);

  const applyEffect = useCallback(
    (eng: Engine, effect: EffectKey, side: Side | null, pad: boolean) => {
      const now = Date.now();
      eng.effects = [
        ...eng.effects.filter((e) => now - e.startedAt < 8000),
        {
          effect,
          startedAt: now,
          side,
          home: eng.colors.home,
          away: eng.colors.away,
          winner: winnerOf(eng.snapshot.score),
        },
      ];
      eng.ticker = [
        {
          id: `${now}-${eng.seq++}`,
          effect,
          side,
          at: now,
          minute: pad ? null : eng.minute,
          pad,
        },
        ...eng.ticker,
      ];
      onCommandRef.current?.({
        kind: "effect",
        effect,
        side,
        colors: eng.colors,
      });
    },
    [],
  );

  // (Re)create the engine when the scenario changes.
  useEffect(() => {
    const init = initRef.current;
    const eng = createEngine(
      SCENARIOS.find((s) => s.id === scenarioId) ?? DEFAULT_SCRIPT,
      init.stat ?? "auto",
      init.speed ?? 60,
    );
    eng.playing = init.autoplay ?? false;
    engineRef.current = eng;
    setUi(buildUi(eng));
  }, [scenarioId, buildUi]);

  // The clock.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastUi = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const eng = engineRef.current;
      if (!eng) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      if (!eng.playing && !eng.dirty) return;
      if (eng.playing) {
        eng.minute = Math.min(
          eng.script.endMinute,
          eng.minute + (dt * eng.speed) / 60,
        );
        if (eng.minute >= eng.script.endMinute) eng.playing = false;
      }
      const { snapshot, events } = replayAt(
        eng.script,
        eng.minute,
        eng.startMs,
      );
      eng.snapshot = snapshot;
      eng.events = events;
      const res = tick(eng.state, {
        snapshot,
        events,
        now: eng.startMs + eng.minute * 60_000,
        delayMs: 0,
      });
      eng.state = res.state;
      eng.activeStat = res.activeStat;
      for (const c of res.commands) {
        const cmd = c.item;
        if (cmd.kind === "effect")
          applyEffect(eng, cmd.effect, cmd.side, false);
        else {
          eng.cmd = cmd;
          eng.resting = restingFor(cmd, STRIP_POINTS, eng.colors);
          onCommandRef.current?.({ kind: "resting", cmd, colors: eng.colors });
        }
      }
      const wasDirty = eng.dirty;
      eng.dirty = false;
      if (wasDirty || ts - lastUi > 120 || !eng.playing) {
        lastUi = ts;
        setUi(buildUi(eng));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [applyEffect, buildUi]);

  const frame = useCallback((now: number, reduced: boolean): Rgb[] => {
    const eng = engineRef.current;
    if (!eng) return [];
    return composeFrame(eng.resting, eng.effects, now, reduced);
  }, []);

  const mutate = useCallback(
    (fn: (eng: Engine) => void) => {
      const eng = engineRef.current;
      if (!eng) return;
      fn(eng);
      eng.dirty = true;
      setUi(buildUi(eng));
    },
    [buildUi],
  );

  const controls = {
    play: useCallback(
      () =>
        mutate((e) => {
          if (e.minute >= e.script.endMinute) seekTo(e, 0);
          e.playing = true;
        }),
      [mutate],
    ),
    pause: useCallback(
      () =>
        mutate((e) => {
          e.playing = false;
        }),
      [mutate],
    ),
    toggle: useCallback(
      () =>
        mutate((e) => {
          if (e.playing) e.playing = false;
          else {
            if (e.minute >= e.script.endMinute) seekTo(e, 0);
            e.playing = true;
          }
        }),
      [mutate],
    ),
    restart: useCallback(
      () =>
        mutate((e) => {
          seekTo(e, 0);
          e.playing = true;
        }),
      [mutate],
    ),
    seek: useCallback(
      (minute: number) => mutate((e) => seekTo(e, minute)),
      [mutate],
    ),
    setSpeed: useCallback(
      (speed: DemoSpeed) =>
        mutate((e) => {
          e.speed = speed;
        }),
      [mutate],
    ),
    setStat: useCallback(
      (stat: StatKey) =>
        mutate((e) => {
          e.stat = stat;
          e.state = { ...e.state, stat, lastShare: null, lastFill: null };
        }),
      [mutate],
    ),
    fire: useCallback(
      (effect: EffectKey, side: Side | null) =>
        mutate((e) => applyEffect(e, effect, side, true)),
      [mutate, applyEffect],
    ),
  };

  /** The resting command on the strip right now, for late subscribers (e.g. "send to lights"). */
  const current = useCallback(() => {
    const eng = engineRef.current;
    return eng ? { cmd: eng.cmd, colors: eng.colors } : null;
  }, []);

  return { ui, frame, controls, current };
}

function seekTo(eng: Engine, minute: number) {
  eng.minute = Math.max(0, Math.min(eng.script.endMinute, minute));
  eng.state = initialState(eng.stat);
  eng.effects = [];
  eng.cmd = null;
  eng.resting = restingFor(null, STRIP_POINTS, eng.colors);
  const { snapshot, events } = replayAt(eng.script, eng.minute, eng.startMs);
  eng.snapshot = snapshot;
  eng.events = events;
  eng.ticker = pastTicker(eng);
}
