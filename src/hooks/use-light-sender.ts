"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Rgb } from "@/engine/colors";
import type { DemoCommand } from "@/hooks/use-demo-engine";
import { ApiRequestError, api } from "@/lib/api";
import type { FireEffectBody, SetLightsBody } from "@/lib/api-types";
import { restingPoints } from "@/lights/render";

/** At most ~4 calls a second: kind to the bridge and inside the 5/s ask. */
const MIN_INTERVAL_MS = 240;
const GRADIENT_POINTS = 5;

const round = (c: Rgb): Rgb => [
  Math.round(c[0]),
  Math.round(c[1]),
  Math.round(c[2]),
];

/**
 * Mirrors the demo to the user's real strip via POST /api/lights/set and /effect.
 * Resting colours coalesce (latest wins); effects queue in order. Signed-out or a
 * missing route switches it off again with a toast instead of failing silently.
 */
export function useLightSender() {
  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabledRef = useRef(false);
  const setBody = useRef<SetLightsBody | null>(null);
  const effects = useRef<FireEffectBody[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);
  const warned = useRef(false);

  const disable = useCallback((message: string) => {
    enabledRef.current = false;
    setEnabledState(false);
    setBody.current = null;
    effects.current = [];
    toast.error(message);
  }, []);

  const pump = useCallback(() => {
    if (timer.current || !enabledRef.current) return;
    const wait = Math.max(0, lastSent.current + MIN_INTERVAL_MS - Date.now());
    timer.current = setTimeout(async () => {
      timer.current = null;
      if (!enabledRef.current) return;
      const fx = effects.current.shift();
      const set = fx ? null : setBody.current;
      if (!fx && !set) return;
      if (set) setBody.current = null;
      lastSent.current = Date.now();
      setBusy(true);
      try {
        if (fx) await api.fireEffect(fx);
        else if (set) await api.setLights(set);
        warned.current = false;
      } catch (e) {
        if (e instanceof ApiRequestError && e.unauthenticated) {
          disable("Sign in to send the demo to your lights.");
          setBusy(false);
          return;
        }
        if (e instanceof ApiRequestError && e.status === 404) {
          disable("Light control isn't available on this server yet.");
          setBusy(false);
          return;
        }
        if (!warned.current) {
          warned.current = true;
          toast.warning("Your strip didn't answer. Still trying.");
        }
      }
      setBusy(false);
      if (effects.current.length || setBody.current) pump();
    }, wait);
  }, [disable]);

  const send = useCallback(
    (c: DemoCommand) => {
      if (!enabledRef.current) return;
      if (c.kind === "resting") {
        const pts = restingPoints(c.cmd, GRADIENT_POINTS, c.colors);
        if (!pts) return;
        setBody.current = { colors: pts.map(round), transitionMs: 400 };
      } else {
        if (effects.current.length >= 8) effects.current.shift();
        effects.current.push({
          effect: c.effect,
          side: c.side,
          home: round(c.colors.home),
          away: round(c.colors.away),
        });
      }
      pump();
    },
    [pump],
  );

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on;
    setEnabledState(on);
    if (!on) {
      setBody.current = null;
      effects.current = [];
    }
  }, []);

  useEffect(
    () => () => {
      enabledRef.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { enabled, setEnabled, send, busy };
}
