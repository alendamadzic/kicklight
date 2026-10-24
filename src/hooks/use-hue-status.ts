"use client";

import useSWR from "swr";
import { ApiRequestError, api } from "@/lib/api";
import type { HueStatus } from "@/lib/api-types";
import { SAMPLE_HUE_STATUS } from "@/lib/sample-data";

export type HueStatusState =
  | { phase: "loading" }
  | { phase: "ok"; status: HueStatus }
  | { phase: "signed_out"; status: HueStatus }
  | { phase: "unavailable"; status: HueStatus };

/** Hue link state, with a graceful result for signed-out users and a missing route. */
export function useHueStatus() {
  const { data, error, mutate } = useSWR("hue-status", () => api.hueStatus(), {
    shouldRetryOnError: false,
  });
  const result: HueStatusState = data
    ? { phase: "ok", status: data }
    : error instanceof ApiRequestError && error.unauthenticated
      ? { phase: "signed_out", status: SAMPLE_HUE_STATUS }
      : error
        ? { phase: "unavailable", status: SAMPLE_HUE_STATUS }
        : { phase: "loading" };
  const refresh = async () => {
    await mutate();
  };
  return { result, refresh };
}
