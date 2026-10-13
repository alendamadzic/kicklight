"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const MAX_S = 120;

/**
 * TV delay, 0 to 120 seconds. Your lights wait this long so a goal lands when it
 * lands on your telly. A plain slider: nudge until it feels right.
 */
export function DelaySlider({
  valueMs,
  onCommit,
  disabled,
}: {
  valueMs: number;
  /** Fired when the viewer lets go (or taps a nudge). */
  onCommit: (ms: number) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const seconds = drag ?? Math.round(valueMs / 1000);

  const nudge = (d: number) => {
    const next = Math.max(0, Math.min(MAX_S, seconds + d));
    setDrag(null);
    onCommit(next * 1000);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="kl-display text-lg leading-none">TV delay</span>
        <span className="kl-display text-2xl leading-none tabular-nums text-amber">
          {seconds}
          <span className="ml-0.5 text-sm text-muted-foreground">s</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon-lg"
          aria-label="5 seconds less delay"
          disabled={disabled || seconds <= 0}
          onClick={() => nudge(-5)}
          className="size-11 shrink-0"
        >
          <MinusIcon />
        </Button>
        <div className="min-w-0 flex-1 py-3">
          <Slider
            aria-label="TV delay in seconds"
            min={0}
            max={MAX_S}
            step={1}
            value={[seconds]}
            disabled={disabled}
            onValueChange={(v) => setDrag(Array.isArray(v) ? v[0] : v)}
            onValueCommitted={(v) => {
              const s = Array.isArray(v) ? v[0] : v;
              setDrag(null);
              onCommit(s * 1000);
            }}
          />
        </div>
        <Button
          variant="secondary"
          size="icon-lg"
          aria-label="5 seconds more delay"
          disabled={disabled || seconds >= MAX_S}
          onClick={() => nudge(5)}
          className="size-11 shrink-0"
        >
          <PlusIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lights wait this long so goals land when they land on your TV.
      </p>
    </div>
  );
}
