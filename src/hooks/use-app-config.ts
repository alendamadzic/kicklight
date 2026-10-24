"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/api-types";
import { DEFAULT_CONFIG } from "@/lib/sample-data";

/** App mode (cloud or local). Read once per visit; cloud until it answers, or if it can't. */
export function useAppConfig(): AppConfig {
  const { data } = useSWR("config", () => api.config(), {
    fallbackData: DEFAULT_CONFIG,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
  return data;
}
