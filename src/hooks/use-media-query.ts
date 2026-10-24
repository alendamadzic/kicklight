"use client";

import { useCallback, useSyncExternalStore } from "react";

/** True while the media query matches. False on the server and the first client paint. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Desktop-sized layouts: overlays become popovers, the remote goes two-column. */
export const DESKTOP_QUERY = "(min-width: 768px)";
