"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyKitOverride,
  type KitOverrides,
  pickStripColors,
  type Rgb,
} from "@/engine/colors";
import { EFFECTS, type EffectKey } from "@/engine/effects";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { Side } from "@/engine/model";
import {
  type ActiveEffect,
  composeFrame,
  STRIP_POINTS,
} from "@/lights/compose";
import { splitPoints } from "@/lights/render";

/** The resting split the guide plays effects over: home a little on top. */
export const PREVIEW_SHARE = 0.55;

export interface PreviewPlaying {
  /** Which guide row started it, so only that row shows as playing. */
  id: string;
  effect: EffectKey;
  side: Side | null;
  startedAt: number;
  durationMs: number;
}

/**
 * A strip with no match behind it: two sample kits resting on a split, and one effect at a
 * time played over the top on demand. Feeds the `/lights` guide.
 */
export function useEffectPreview(kitOverrides?: KitOverrides) {
  const script = SCENARIOS[0];
  // Preferences hand back a fresh object each render; key the memo on its contents.
  const overridesKey = JSON.stringify(kitOverrides ?? {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the overrides' contents
  const colors = useMemo(
    () =>
      pickStripColors(
        applyKitOverride(script.home, kitOverrides),
        applyKitOverride(script.away, kitOverrides),
      ),
    [script, overridesKey],
  );

  const resting = useMemo(
    () => splitPoints(PREVIEW_SHARE, STRIP_POINTS, colors),
    [colors],
  );
  const restingRef = useRef(resting);
  const effectRef = useRef<ActiveEffect | null>(null);
  useEffect(() => {
    restingRef.current = resting;
  }, [resting]);

  const [playing, setPlaying] = useState<PreviewPlaying | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Play one effect. `side` is whose colour it takes; for full time it's the winner. */
  const play = useCallback(
    (id: string, effect: EffectKey, side: Side | null) => {
      const fx = EFFECTS[effect];
      if (!fx) return;
      const startedAt = Date.now();
      effectRef.current = {
        effect,
        startedAt,
        side,
        home: colors.home,
        away: colors.away,
        winner: effect === "full_time" ? side : null,
      };
      setPlaying({ id, effect, side, startedAt, durationMs: fx.durationMs });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPlaying(null), fx.durationMs);
    },
    [colors],
  );

  const stop = useCallback(() => {
    effectRef.current = null;
    if (timer.current) clearTimeout(timer.current);
    setPlaying(null);
  }, []);

  const frame = useCallback((now: number, reduced: boolean): Rgb[] => {
    const e = effectRef.current;
    return composeFrame(restingRef.current, e ? [e] : [], now, reduced);
  }, []);

  return { script, colors, frame, playing, play, stop };
}
