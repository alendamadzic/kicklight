"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";
import type { Side } from "@/engine/model";
import { effectLabel, type TickerItem, TOAST_EFFECTS } from "@/lib/ticker";

const NOT_STARTED = Symbol("not started");

/**
 * Toast the big moments (goals, reds, penalties, full time) as they reach the top of the
 * ticker. What's already there when it starts watching is history and stays quiet, and
 * effects fired by hand from the event pad are their own feedback.
 */
export function useMomentToasts(
  top: TickerItem | undefined,
  teamName: (side: Side) => string | undefined,
  enabled = true,
) {
  const last = useRef<string | null | typeof NOT_STARTED>(NOT_STARTED);
  const nameOf = useEffectEvent(teamName);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nameOf is an effect event, which must stay out of the deps
  useEffect(() => {
    if (!enabled) {
      last.current = NOT_STARTED;
      return;
    }
    const id = top?.id ?? null;
    if (last.current === NOT_STARTED) {
      last.current = id;
      return;
    }
    if (!top || id === last.current) return;
    last.current = id;
    if (top.pad || !TOAST_EFFECTS.has(top.effect)) return;
    const team = top.side ? nameOf(top.side) : undefined;
    const minute = top.minute != null ? `${Math.floor(top.minute)}'` : null;
    toast(effectLabel(top.effect), {
      description: [team, minute].filter(Boolean).join(" · ") || undefined,
    });
  }, [top, enabled]);
}
