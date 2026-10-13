"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { AppConfig, HueStatus } from "@/lib/api-types";
import { FALLBACK_CONFIG, FIXTURE_HUE_STATUS } from "@/lib/fixtures";

let configPromise: Promise<AppConfig> | null = null;

/** App mode (cloud or local). Falls back to cloud when the route isn't there. */
export function useConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  useEffect(() => {
    configPromise ??= api.config().catch(() => FALLBACK_CONFIG);
    let live = true;
    void configPromise.then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}

export type HueStatusState =
  | { phase: "loading" }
  | { phase: "ok"; status: HueStatus }
  | { phase: "signed_out"; status: HueStatus }
  | { phase: "unavailable"; status: HueStatus };

/** Hue link state, with a graceful result for signed-out users and a missing route. */
export function useHueStatus() {
  const [result, setResult] = useState<HueStatusState>({ phase: "loading" });

  const refresh = useCallback(async () => {
    try {
      const status = await api.hueStatus();
      setResult({ phase: "ok", status });
    } catch (e) {
      if (e instanceof ApiRequestError && e.unauthenticated) {
        setResult({ phase: "signed_out", status: FIXTURE_HUE_STATUS });
      } else {
        setResult({ phase: "unavailable", status: FIXTURE_HUE_STATUS });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { result, refresh };
}
