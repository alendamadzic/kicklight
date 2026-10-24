"use client";

import { useEffect, useRef, useState } from "react";
import type { EffectKey } from "@/engine/effects";
import type { Side } from "@/engine/model";
import type { TickerItem } from "@/lib/ticker";

/** What the phone does when a moment lands: a goal takes over, cards and VAR tint. */
export type MomentFxKind = "goal" | "yellow" | "red" | "var" | "penalty";

export interface MomentFx {
  id: string;
  kind: MomentFxKind;
  side: Side | null;
  minute: number | null;
}

const KIND: Partial<Record<EffectKey, MomentFxKind>> = {
  goal: "goal",
  yellow_card: "yellow",
  red_card: "red",
  var: "var",
  penalty_awarded: "penalty",
};

const HOLD_MS: Record<MomentFxKind, number> = {
  goal: 2200,
  yellow: 1600,
  red: 1800,
  var: 2400,
  penalty: 1800,
};

/**
 * The moment effect to show right now, if any. Like the toasts, whatever is already
 * on top when it starts watching is history; only new arrivals play.
 */
export function useMomentFx(
  top: TickerItem | undefined,
  enabled = true,
): MomentFx | null {
  const [fx, setFx] = useState<MomentFx | null>(null);
  const last = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      last.current = undefined;
      return;
    }
    const id = top?.id ?? null;
    if (last.current === undefined) {
      last.current = id;
      return;
    }
    if (!top || id === last.current) return;
    last.current = id;
    const kind = KIND[top.effect];
    if (!kind) return;
    setFx({ id: top.id, kind, side: top.side, minute: top.minute ?? null });
    const t = setTimeout(() => setFx(null), HOLD_MS[kind]);
    return () => clearTimeout(t);
  }, [top, enabled]);

  return fx;
}
