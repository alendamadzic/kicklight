"use client";

import { useCallback, useSyncExternalStore } from "react";

// One clock for the whole app, safe to render on the server. Prerendering may not read the
// time (Cache Components), and a server time would not match the browser's when hydrating, so
// the server and the hydrating render see 0, "not known yet", and the browser then switches to
// the real time. Callers treat 0 as unknown and show nothing time-dependent for that frame.

let current = 0;

function snapshot() {
  if (current === 0) current = Date.now();
  return current;
}

const serverSnapshot = () => 0;

/** The current time in ms, refreshed every `intervalMs`; 0 on the server and while hydrating. */
export function useNow(intervalMs: number): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const t = setInterval(() => {
        current = Date.now();
        onChange();
      }, intervalMs);
      return () => clearInterval(t);
    },
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
