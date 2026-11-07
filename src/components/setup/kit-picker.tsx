"use client";

import { CheckIcon } from "lucide-react";
import { LedBar } from "@/components/chrome/led-bar";
import {
  hexToRgb,
  type KitChoice,
  liftForGlow,
  needsLift,
  rgbToHex,
} from "@/engine/colors";
import type { CachedTeam } from "@/lib/team-cache";
import { cn } from "@/lib/utils";

/** Colours that glow well on a Hue gradient strip, for a custom pick. */
const SWATCHES = [
  "#ffffff",
  "#ff3b3b",
  "#ff8a1f",
  "#ffd23f",
  "#4fd18b",
  "#2ec4f1",
  "#3d7bff",
  "#9b5cff",
  "#ff5fa2",
  "#cfe86b",
];

/**
 * The colour one team gets on the strip: its primary kit, its alternate (when a match
 * has shown it), or a colour of your own. The preview shows what the strip will
 * actually glow, after the dark-colour lift.
 *
 * With `auto` (on a match), there's an Auto option too: the colour the strip would
 * pick by itself, clash rule included. `value` undefined then means Auto, and
 * choosing it calls `onChange(null)`.
 */
export function KitPicker({
  team,
  value,
  onChange,
  auto,
}: {
  team: Pick<CachedTeam, "color" | "alternateColor">;
  value: KitChoice | undefined;
  onChange: (choice: KitChoice | null) => void;
  /** The colour Auto would glow, #rrggbb. Shows the Auto option. */
  auto?: string;
}) {
  const choice: KitChoice | "auto" = value ?? (auto ? "auto" : "primary");
  const hex =
    choice === "auto"
      ? (auto as string)
      : choice === "primary"
        ? team.color
        : choice === "alternate"
          ? (team.alternateColor ?? team.color)
          : choice;
  const glow = rgbToHex(liftForGlow(hexToRgb(hex)));
  const lifted = needsLift(hexToRgb(hex));

  const options: {
    key: KitChoice | "auto";
    label: string;
    color: string;
  }[] = [
    ...(auto ? [{ key: "auto" as const, label: "Auto", color: auto }] : []),
    { key: "primary", label: "Main kit", color: team.color },
    ...(team.alternateColor
      ? [
          {
            key: "alternate" as const,
            label: "Second kit",
            color: team.alternateColor,
          },
        ]
      : []),
  ];
  const compact = options.length === 3;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl bg-stage px-4 py-4">
        <LedBar
          colors={[glow]}
          count={8}
          segmentClassName="h-2 w-5"
          className="gap-1"
        />
      </div>
      {lifted ? (
        <p className="text-xs text-muted-foreground">
          This colour is too dark to glow, so the strip shows a brighter
          version, as above.
        </p>
      ) : null}

      <div
        className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2")}
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key === "auto" ? null : o.key)}
            aria-pressed={choice === o.key}
            className={cn(
              "flex items-center rounded-xl border text-sm font-medium transition-colors",
              compact
                ? "h-16 flex-col justify-center gap-1.5 px-1"
                : "h-12 gap-2.5 px-3",
              choice === o.key
                ? "border-amber bg-amber/10"
                : "border-border hover:bg-muted",
            )}
          >
            <span
              aria-hidden
              className="size-5 rounded-md ring-1 ring-foreground/15"
              style={{ background: o.color }}
            />
            {o.label}
            {choice === o.key && !compact ? (
              <CheckIcon className="ml-auto size-4 text-amber" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Or pick a colour</span>
        <div className="grid grid-cols-5 gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c as KitChoice)}
              aria-label={`Use ${c}`}
              aria-pressed={choice === c}
              className={cn(
                "aspect-square rounded-lg ring-1 ring-foreground/15 transition-transform active:scale-95",
                choice === c &&
                  "ring-2 ring-amber ring-offset-2 ring-offset-popover",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="flex h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm">
          <input
            type="color"
            value={glow}
            onChange={(e) => onChange(e.target.value as KitChoice)}
            className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          Any colour
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {hex}
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {auto
          ? "Just for this match. Auto picks a colour that stands apart from the other team; anything else stays as you set it."
          : "If both teams end up too alike, one side still switches to its second kit so you can tell them apart."}
      </p>
    </div>
  );
}
