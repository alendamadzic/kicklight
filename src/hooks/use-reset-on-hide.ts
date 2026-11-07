"use client";

import { useEffectEvent, useLayoutEffect } from "react";

/**
 * Runs `reset` when the page is hidden. Recently visited pages stay mounted but hidden
 * (Cache Components keeps them in React's <Activity>), so an open sheet, menu or confirm
 * would still be open on the way back. Layout-effect cleanup runs before the page hides,
 * so it never flashes open. Also runs on unmount.
 */
export function useResetOnHide(reset: () => void) {
  const onHide = useEffectEvent(reset);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onHide is an effect event, which must stay out of the deps
  useLayoutEffect(() => () => onHide(), []);
}
