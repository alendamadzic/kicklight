"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { LedBar } from "@/components/chrome/led-bar";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { HueLightInfo } from "@/lib/api-types";
import { SAMPLE_LIGHTS } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const BLINK_MS = 2500;

/** A tiny drawing of the light: a TV-backlight strip, a Play bar, or a loose strip. */
function StripGlyph({
  archetype,
  blinking,
}: {
  archetype: string;
  blinking: boolean;
}) {
  const glow = blinking
    ? "border-amber shadow-[0_0_14px_var(--amber)] animate-pulse"
    : "border-muted-foreground/50";
  if (archetype.includes("tv"))
    return (
      <span aria-hidden className="relative block h-7 w-11 shrink-0">
        <span className="absolute inset-[3px] rounded-[3px] bg-muted" />
        <span className={cn("absolute inset-0 rounded-md border-2", glow)} />
      </span>
    );
  if (archetype.includes("bar") || archetype.includes("play"))
    return (
      <span
        aria-hidden
        className="flex h-7 w-11 shrink-0 items-end justify-center gap-1.5"
      >
        <span className={cn("h-6 w-2 rounded-sm border-2", glow)} />
        <span className={cn("h-6 w-2 rounded-sm border-2", glow)} />
      </span>
    );
  return (
    <span aria-hidden className="flex h-7 w-11 shrink-0 items-center">
      <span className={cn("h-2 w-full rounded-full border-2", glow)} />
    </span>
  );
}

/** Step 3: choose which gradient strip on the bridge is behind the TV. Identify blinks it. */
export function PickStep({
  preview,
  selectedId,
  onPicked,
  onBack,
}: {
  preview: boolean;
  selectedId: string | null;
  onPicked: () => void;
  onBack: () => void;
}) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const [blinking, setBlinking] = useState<string | null>(null);
  const { data, error } = useSWR(preview ? null : "hue-lights", () =>
    api.hueLights(),
  );
  // No bridge to ask (previewing, signed out, not linked yet): show sample strips.
  const sample = preview || Boolean(error);
  const lights: HueLightInfo[] | null = sample
    ? SAMPLE_LIGHTS
    : (data?.lights ?? null);

  const identify = async (light: HueLightInfo) => {
    setBlinking(light.id);
    setTimeout(() => setBlinking((b) => (b === light.id ? null : b)), BLINK_MS);
    if (sample) return;
    try {
      await api.identifyLight({ lightId: light.id });
    } catch {
      toast.error("That light didn't answer. Is it switched on?");
      setBlinking(null);
    }
  };

  const pick = async (light: HueLightInfo) => {
    setChoosing(light.id);
    if (!sample) {
      try {
        await api.selectLight({ lightId: light.id, lightName: light.name });
      } catch {
        toast.error("Couldn't save that strip. Try again.");
        setChoosing(null);
        return;
      }
    }
    setChoosing(null);
    onPicked();
  };

  return (
    <section
      className="kl-panel flex flex-col gap-4 p-5"
      aria-labelledby="pick-h"
    >
      <div>
        <h2 id="pick-h" className="kl-headline text-2xl">
          Which strip is behind your TV?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Not sure? Tap Identify and the strip blinks. Only gradient lights show
          up here.
        </p>
      </div>
      {sample ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Sample lights shown. Your bridge's lights appear here once it's
          linked.
        </p>
      ) : null}
      {lights === null ? (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <LedBar variant="chase" /> Looking for strips…
        </div>
      ) : lights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No gradient strips found on this bridge. Gradient lightstrips and Play
          bars work best.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lights.map((l) => {
            const selected = selectedId === l.id;
            const isBlinking = blinking === l.id;
            return (
              <li
                key={l.id}
                className={cn(
                  "grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border bg-background px-3 py-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                  selected || isBlinking ? "border-amber" : "border-border",
                )}
              >
                <StripGlyph archetype={l.archetype} blinking={isBlinking} />
                <span className="min-w-0">
                  <span className="block text-base leading-tight font-semibold">
                    {l.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.pointsCapable} colour points
                    {selected ? " · in use" : ""}
                  </span>
                </span>
                {/* Own row on phones so long strip names stay readable. */}
                <span className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex">
                  <button
                    type="button"
                    onClick={() => identify(l)}
                    disabled={isBlinking}
                    className="kl-press h-10 rounded-lg bg-secondary px-3 text-sm font-medium disabled:opacity-70"
                  >
                    {isBlinking ? "Blinking…" : "Identify"}
                  </button>
                  <button
                    type="button"
                    onClick={() => pick(l)}
                    disabled={choosing !== null}
                    aria-label={`Use ${l.name}`}
                    className="kl-press grid h-10 min-w-14 place-items-center rounded-lg bg-amber px-3 text-sm font-semibold text-[#1a1200] disabled:opacity-60"
                  >
                    {choosing === l.id ? <Spinner /> : "Use"}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
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
