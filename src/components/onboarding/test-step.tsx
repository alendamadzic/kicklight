"use client";

import { CheckIcon, RotateCcwIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { LedBar } from "@/components/chrome/led-bar";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Rgb } from "@/engine/colors";
import { usePreferences } from "@/hooks/use-preferences";
import { ApiRequestError, api } from "@/lib/api";
import { TEST_COLORS, TEST_STEP_MS, testSegment } from "@/lib/strip-test";
import { STRIP_POINTS } from "@/lights/compose";

type Phase = "idle" | "running" | "ask" | "nothing" | "done";

const DIM: Rgb = [14, 14, 18];
/** How long the pattern takes before we ask about it. */
const RUN_MS = TEST_COLORS.length * TEST_STEP_MS + 900;
/** The server needs a moment to pick up a flipped direction before the re-test. */
const RETEST_DELAY_MS = 600;

const BIG = "h-12 rounded-xl text-base font-semibold";

/**
 * Step 4: light red, amber, green, blue, purple left to right on the real strip and
 * the virtual one, then ask whether red came up on the left. "No" flips the strip
 * direction and runs it again, so home colours sit on the correct side all season.
 */
export function TestStep({
  preview,
  onBack,
}: {
  preview: boolean;
  onBack: () => void;
}) {
  const startRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [flipped, setFlipped] = useState(false);
  const { prefs, update } = usePreferences();

  const frame = useCallback((now: number): Rgb[] => {
    const start = startRef.current;
    const n = STRIP_POINTS;
    if (start === null) return Array.from({ length: n }, () => DIM);
    const lit = Math.min(
      TEST_COLORS.length,
      Math.floor((now - start) / TEST_STEP_MS) + 1,
    );
    return Array.from({ length: n }, (_, i) => {
      const seg = testSegment(i, n);
      return seg < lit ? [...TEST_COLORS[seg]] : DIM;
    });
  }, []);

  const run = () => {
    startRef.current = Date.now();
    setPhase("running");
    if (!preview) {
      api.hueTest().catch((e) => {
        if (e instanceof ApiRequestError && !e.unavailable)
          toast.error("Your strip didn't answer the test.");
      });
    }
    setTimeout(() => setPhase("ask"), RUN_MS);
  };

  const flip = () => {
    update({ strip_reversed: !prefs.strip_reversed });
    setFlipped(true);
    setTimeout(run, RETEST_DELAY_MS);
  };

  return (
    <section
      className="kl-panel flex flex-col gap-4 p-5"
      aria-labelledby="test-h"
    >
      <div>
        <h2 id="test-h" className="kl-headline text-2xl">
          {phase === "ask"
            ? "Did red light up on the left?"
            : phase === "nothing"
              ? "Let's find out why"
              : phase === "done"
                ? "Your lights are set up"
                : "Light it up"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {phase === "ask"
            ? "Look at the strip behind your TV. The colours ran left to right: red, amber, green, blue, purple."
            : phase === "done"
              ? "Home colours will sit on the left, away on the right, like the strip below."
              : phase === "nothing"
                ? "Check these, then test again."
                : "Five colours light up one after another, on your strip and below."}
        </p>
      </div>

      <VirtualStrip frame={frame} label="Virtual strip test pattern" />

      {flipped && phase !== "done" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          We flipped the strip's direction
          {prefs.strip_reversed ? " (it now runs right to left)" : ""}. Watch
          the test again.
        </p>
      ) : null}

      {phase === "idle" ? (
        <Button size="lg" onClick={run} className={BIG}>
          <ZapIcon data-icon="inline-start" />
          Test my strip
        </Button>
      ) : null}

      {phase === "running" ? (
        <div className="flex h-12 items-center justify-center gap-3 rounded-xl bg-muted text-sm font-medium">
          <LedBar variant="chase" />
          Testing…
        </div>
      ) : null}

      {phase === "ask" ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => setPhase("done")} className={BIG}>
            <CheckIcon data-icon="inline-start" />
            Yes, red was on the left
          </Button>
          <Button size="lg" variant="secondary" onClick={flip} className={BIG}>
            No, it ran the other way
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setPhase("nothing")}
            className={BIG}
          >
            Nothing lit up
          </Button>
        </div>
      ) : null}

      {phase === "nothing" ? (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2 text-sm">
            {[
              "The Hue bridge is plugged in and its lights are on.",
              "The strip is powered and switched on in the Hue app.",
              "You picked the strip behind the TV. Go back and use Identify to check.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber" />
                {t}
              </li>
            ))}
          </ul>
          <Button size="lg" onClick={run} className={BIG}>
            <RotateCcwIcon data-icon="inline-start" />
            Test again
          </Button>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Link
            href="/matches"
            className={buttonVariants({ size: "lg", className: BIG })}
          >
            Pick a match
          </Link>
          <Button variant="secondary" size="lg" onClick={run} className={BIG}>
            Test again
          </Button>
        </div>
      ) : null}

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
