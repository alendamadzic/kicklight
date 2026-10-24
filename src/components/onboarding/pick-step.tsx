"use client";

import { ZapIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { HueLightInfo } from "@/lib/api-types";
import { SAMPLE_LIGHTS } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

/** Step 2: choose which gradient strip on the bridge is behind the TV. */
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
  const { data, error } = useSWR(preview ? null : "hue-lights", () =>
    api.hueLights(),
  );
  // No bridge to ask (previewing, signed out, not linked yet): show sample strips.
  const sample = preview || Boolean(error);
  const lights: HueLightInfo[] | null = sample
    ? SAMPLE_LIGHTS
    : (data?.lights ?? null);

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
        <h2 id="pick-h" className="kl-display text-2xl leading-none">
          Which strip is behind your TV?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only gradient-capable lights show up. Kicklight needs 5 colour points.
        </p>
      </div>
      {sample ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Sample lights shown. Your bridge's lights appear here once it's
          linked.
        </p>
      ) : null}
      {lights === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner /> Looking for strips…
        </div>
      ) : lights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No gradient strips found on this bridge. Gradient lightstrips and Play
          bars work best.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lights.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => pick(l)}
                disabled={choosing !== null}
                aria-pressed={selectedId === l.id}
                className={cn(
                  "kl-press flex min-h-16 w-full items-center gap-3 rounded-xl border bg-background px-4 text-left transition-colors hover:border-foreground/30 disabled:opacity-60",
                  selectedId === l.id ? "border-amber" : "border-border",
                )}
              >
                <ZapIcon className="size-5 shrink-0 text-amber" />
                <span className="min-w-0 flex-1">
                  <span className="kl-display block truncate text-xl leading-none">
                    {l.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.pointsCapable} colour points
                  </span>
                </span>
                {choosing === l.id ? (
                  <Spinner />
                ) : (
                  <span className="kl-display text-sm text-amber">Use</span>
                )}
              </button>
            </li>
          ))}
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
