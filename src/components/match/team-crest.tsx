import { readableOn } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A crest when the feed has one; otherwise a kit-colour disc with the team's initials. */
export function TeamCrest({
  team,
  size = 32,
  className,
}: {
  team: { short: string; color: string; crest?: string };
  size?: number;
  className?: string;
}) {
  if (team.crest) {
    return (
      // biome-ignore lint/performance/noImgElement: remote crest URLs vary by feed
      <img
        src={team.crest}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn("object-contain drop-shadow", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "kl-display inline-flex items-center justify-center rounded-full ring-1 ring-black/20",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: team.color,
        color: readableOn(team.color),
        fontSize: Math.round(size * 0.36),
      }}
    >
      {team.short.slice(0, 3)}
    </span>
  );
}
