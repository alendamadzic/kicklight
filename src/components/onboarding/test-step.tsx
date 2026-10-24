"use client";

import { CheckIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Rgb } from "@/engine/colors";
import { ApiRequestError, api } from "@/lib/api";
import { STRIP_POINTS } from "@/lights/compose";

const SEGMENTS = 5;
const SEGMENT_COLORS: Rgb[] = [
  [255, 82, 82],
  [255, 181, 71],
  [79, 209, 139],
  [111, 183, 255],
  [181, 140, 255],
];
const STEP_MS = 520;

/** Step 3: fire a segment-by-segment pattern on the real strip and the virtual one. */
export function TestStep({
  preview,
  onBack,
}: {
  preview: boolean;
  onBack: () => void;
}) {
  const startRef = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const frame = useCallback((now: number): Rgb[] => {
    const start = startRef.current;
    const n = STRIP_POINTS;
    const dim: Rgb = [14, 14, 18];
    if (start === null) return Array.from({ length: n }, () => dim);
    const lit = Math.min(SEGMENTS, Math.floor((now - start) / STEP_MS) + 1);
    return Array.from({ length: n }, (_, i) => {
      const seg = Math.min(SEGMENTS - 1, Math.floor((i / n) * SEGMENTS));
      return seg < lit ? SEGMENT_COLORS[seg] : dim;
    });
  }, []);

  const run = async () => {
    startRef.current = Date.now();
    setState("running");
    if (!preview) {
      api.hueTest().catch((e) => {
        if (e instanceof ApiRequestError && !e.unavailable)
          toast.error("Your strip didn't answer the test.");
      });
    }
    setTimeout(() => setState("done"), SEGMENTS * STEP_MS + 600);
  };

  return (
    <section
      className="kl-panel flex flex-col gap-4 p-5"
      aria-labelledby="test-h"
    >
      <div>
        <h2 id="test-h" className="kl-display text-2xl leading-none">
          Light it up
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Five colour segments will fire one after another, on the strip and
          below.
        </p>
      </div>
      <VirtualStrip frame={frame} label="Virtual strip test pattern" />
      {state === "done" ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckIcon className="size-4" /> Did all five segments light in
            order? You're set.
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Link
              href="/matches"
              className={buttonVariants({
                size: "lg",
                className: "kl-display h-12 rounded-xl text-lg",
              })}
            >
              Go to matches
            </Link>
            <Button
              variant="secondary"
              size="lg"
              onClick={run}
              className="kl-display h-12 rounded-xl text-lg"
            >
              Run again
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="lg"
          onClick={run}
          disabled={state === "running"}
          className="kl-display h-12 rounded-xl text-lg"
        >
          {state === "running" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <ZapIcon data-icon="inline-start" />
          )}
          {state === "running" ? "Testing…" : "Test my strip"}
        </Button>
      )}
      <button
        type="button"
        onClick={onBack}
        className="kl-press min-h-11 self-start text-sm text-muted-foreground underline underline-offset-4"
      >
        Back
      </button>
    </section>
  );
}
