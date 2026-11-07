"use client";

import { SWRConfig, unstable_serialize } from "swr";
import { ServerVisitorDay } from "@/hooks/use-visitor-day";

/**
 * Hands data the server already fetched to the client hooks: each entry fills the SWR cache
 * under its key, so the page renders full on the first paint and polling carries on from
 * there. Also tells the date hooks which day and zone the server rendered for.
 */
export function DataSeed({
  today,
  timeZone,
  entries,
  children,
}: {
  today: string;
  timeZone: string;
  entries: ReadonlyArray<readonly [key: readonly unknown[], data: unknown]>;
  children: React.ReactNode;
}) {
  const fallback = Object.fromEntries(
    entries.map(([key, data]) => [unstable_serialize(key), data]),
  );
  return (
    <ServerVisitorDay value={{ today, timeZone }}>
      <SWRConfig value={{ fallback }}>{children}</SWRConfig>
    </ServerVisitorDay>
  );
}
