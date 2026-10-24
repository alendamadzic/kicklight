"use client";

import { SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Strip brightness, right on the remote. A horizontal slider in the dock on desktop;
 * on a phone a button that opens a tall slider, like Control Center. The lights pick
 * the new level up on their next update.
 */
export function BrightnessControl({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const read = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : v);

  const slider = (vertical: boolean) => (
    <Slider
      aria-label="Strip brightness"
      orientation={vertical ? "vertical" : "horizontal"}
      min={1}
      max={100}
      step={1}
      value={[draft]}
      onValueChange={(v) => setDraft(read(v as number | number[]))}
      onValueCommitted={(v) => onChange(read(v as number | number[]))}
    />
  );

  if (desktop)
    return (
      <div
        className={cn(
          "flex h-14 min-w-0 items-center gap-3 rounded-xl bg-secondary px-4",
          className,
        )}
      >
        <SunIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">{slider(false)}</div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">
          {draft}%
        </span>
      </div>
    );

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Brightness ${draft}%. Change it`}
        className={cn(
          "kl-press flex h-14 items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 text-sm font-semibold tabular-nums",
          className,
        )}
      >
        <SunIcon className="size-4" />
        {draft}%
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={10}
        className="w-auto items-center gap-3 rounded-2xl px-6 py-4"
      >
        <span className="text-sm font-semibold tabular-nums">{draft}%</span>
        <div className="h-44">{slider(true)}</div>
        <SunIcon className="size-4 text-muted-foreground" />
      </PopoverContent>
    </Popover>
  );
}
