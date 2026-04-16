"use client";

import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HueLight } from "@/types";

export function LightSelector({
  lights,
  selectedId,
  onSelect,
}: {
  lights: HueLight[];
  selectedId: string | null;
  onSelect: (light: HueLight) => void;
}) {
  if (lights.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No gradient-capable lights found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {lights.map((light) => (
        <button
          key={light.id}
          type="button"
          onClick={() => onSelect(light)}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
            selectedId === light.id
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50",
          )}
        >
          <Lightbulb
            className={cn(
              "size-5 shrink-0",
              selectedId === light.id
                ? "text-primary"
                : "text-muted-foreground",
            )}
          />
          <div>
            <div className="font-medium">{light.name}</div>
            <div className="text-xs text-muted-foreground">
              {light.archetype}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
