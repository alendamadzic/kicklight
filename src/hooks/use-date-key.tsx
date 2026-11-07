"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import { dateKey, shiftDateKey } from "@/lib/format";

// Which day "today" is. The browser's own clock decides, but prerendering may not read the
// time, so the server and the hydrating render use the day the server worked out for this
// visitor (from their timezone) when it rendered data, or null when it didn't.

const ServerTodayContext = createContext<string | null>(null);

/** Tells the hooks below which day the server rendered as "today" (YYYYMMDD). */
export function ServerToday({
  today,
  children,
}: {
  today: string;
  children: React.ReactNode;
}) {
  return (
    <ServerTodayContext.Provider value={today}>
      {children}
    </ServerTodayContext.Provider>
  );
}

/** Re-check the day every minute so a page left open rolls over at midnight. */
function subscribe(onChange: () => void) {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}

/**
 * YYYYMMDD for the day `offsetDays` from today, local time. Null on the server (and while
 * hydrating) unless the server said which day it rendered.
 */
export function useDateKey(offsetDays: number): string | null {
  const serverToday = useContext(ServerTodayContext);
  const client = useCallback(() => dateKey(offsetDays), [offsetDays]);
  const server = useCallback(
    () => (serverToday ? shiftDateKey(serverToday, offsetDays) : null),
    [serverToday, offsetDays],
  );
  return useSyncExternalStore(subscribe, client, server);
}
