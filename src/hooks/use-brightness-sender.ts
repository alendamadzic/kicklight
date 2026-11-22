"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";

/** At most ~4 calls a second: kind to the bridge and inside the 5/s ask. */
const MIN_INTERVAL_MS = 240;

/**
 * Sends brightness to the live strip while a slider moves. Latest value wins and only one
 * request is in flight, so the strip tracks the thumb as fast as the bridge allows and
 * always ends on the value the slider stopped at.
 */
export function useBrightnessSender() {
  const next = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastSent = useRef(0);

  const pump = useCallback(() => {
    if (timer.current || inFlight.current || next.current == null) return;
    const wait = Math.max(0, lastSent.current + MIN_INTERVAL_MS - Date.now());
    timer.current = setTimeout(async () => {
      timer.current = null;
      const brightness = next.current;
      if (brightness == null) return;
      next.current = null;
      inFlight.current = true;
      lastSent.current = Date.now();
      // A missed step is fine: the next one, or the next pass, catches up.
      await api.setBrightness({ brightness }).catch(() => null);
      inFlight.current = false;
      pump();
    }, wait);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (brightness: number) => {
      next.current = brightness;
      pump();
    },
    [pump],
  );
}
