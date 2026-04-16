import { cn } from "@/lib/utils";
import type { Team } from "@/types";

const sizeClasses = {
  sm: { dot: "size-2.5", text: "text-xs" },
  md: { dot: "size-3", text: "text-sm" },
  lg: { dot: "size-4", text: "text-base font-medium" },
};

export function TeamChip({
  team,
  size = "md",
  hex,
  className,
}: {
  team: Team;
  size?: "sm" | "md" | "lg";
  hex?: string;
  className?: string;
}) {
  const s = sizeClasses[size];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {hex && (
        <span
          className={cn("shrink-0 rounded-full ring-1 ring-black/20", s.dot)}
          style={{ backgroundColor: hex }}
        />
      )}
      <span className={s.text}>{team.name}</span>
    </span>
  );
}
