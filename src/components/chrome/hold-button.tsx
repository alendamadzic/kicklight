"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { buzz } from "@/hooks/use-device-prefs";
import { cn } from "@/lib/utils";

const HOLD_MS = 800;

/**
 * A button you press and hold for an action that's hard to undo (stopping the lights
 * mid-match). It fills like a charging LED while held; letting go early cancels.
 * Works with a pointer, and with Space or Enter held down.
 */
export function HoldButton({
  onHold,
  children,
  label,
  className,
  disabled,
}: {
  onHold: () => void;
  children: ReactNode;
  /** Accessible name, e.g. "Hold to stop and restore lights". */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const started = useRef<number | null>(null);

  const cancel = () => {
    cancelAnimationFrame(raf.current);
    started.current = null;
    setProgress(0);
  };

  const begin = () => {
    if (disabled || started.current != null) return;
    started.current = performance.now();
    const step = (t: number) => {
      if (started.current == null) return;
      const p = Math.min(1, (t - started.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        started.current = null;
        buzz(60);
        onHold();
        setTimeout(() => setProgress(0), 200);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        try {
          // Keep the hold going if the finger drifts off the button.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Not capturable (synthetic or already-released pointer): hold still works.
        }
        begin();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onBlur={cancel}
      className={cn(
        "relative isolate overflow-hidden select-none touch-none",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 origin-left bg-destructive/35"
        style={{ transform: `scaleX(${progress})` }}
      />
      {children}
    </button>
  );
}
