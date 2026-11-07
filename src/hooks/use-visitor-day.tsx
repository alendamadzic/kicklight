"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import { dateKey, shiftDateKey } from "@/lib/format";

// Which day "today" is, and in which timezone. The browser's own clock decides, but
// prerendering may not read the time, and the server can't see the browser's zone. So the
// server and the hydrating render use what the server worked out for this visitor (from
// Vercel's geo header) when it rendered data, and the browser then takes over.

interface VisitorDay {
  /** YYYYMMDD. */
  today: string;
  /** IANA zone name. */
  timeZone: string;
}

const VisitorDayContext = createContext<VisitorDay | null>(null);

/** Tells the hooks below which day, in which zone, the server rendered for this visitor. */
export function ServerVisitorDay({
  value,
  children,
}: {
  value: VisitorDay;
  children: React.ReactNode;
}) {
  return (
    <VisitorDayContext.Provider value={value}>
      {children}
    </VisitorDayContext.Provider>
  );
}

/** Re-check the day every minute so a page left open rolls over at midnight. */
function everyMinute(onChange: () => void) {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}

const never = () => () => {};
const browserZone = () => undefined;

/**
 * YYYYMMDD for the day `offsetDays` from today, local time. Null on the server (and while
 * hydrating) unless the server said which day it rendered.
 */
export function useDateKey(offsetDays: number): string | null {
  const server = useContext(VisitorDayContext);
  const client = useCallback(() => dateKey(offsetDays), [offsetDays]);
  const fromServer = useCallback(
    () => (server ? shiftDateKey(server.today, offsetDays) : null),
    [server, offsetDays],
  );
  return useSyncExternalStore(everyMinute, client, fromServer);
}

/**
 * The zone to format times in: the server's guess while rendering on the server and
 * hydrating, then undefined (the browser's own zone).
 */
export function useTimeZone(): string | undefined {
  const server = useContext(VisitorDayContext);
  const fromServer = useCallback(() => server?.timeZone, [server]);
  return useSyncExternalStore(never, browserZone, fromServer);
}
