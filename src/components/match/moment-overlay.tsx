import type { Side } from "@/engine/model";
import type { MomentFx } from "@/hooks/use-moment-fx";

/**
 * What a moment does on the phone, drawn over the virtual TV's screen so it never
 * covers the controls: a goal floods the screen in the scorer's kit with GOAL,
 * cards tint it, VAR runs a scan bar. Every animation is off under reduced motion.
 */
export function MomentOverlay({
  fx,
  teams,
  score,
}: {
  fx: MomentFx | null;
  teams: Record<Side, { name: string; color: string }>;
  score: { home: number; away: number } | null;
}) {
  if (!fx) return null;
  const team = fx.side ? teams[fx.side] : null;
  const minute = fx.minute != null ? `${Math.floor(fx.minute)}'` : null;
  return (
    <>
      <output className="sr-only">{announce(fx, team?.name, minute)}</output>
      <Visual fx={fx} team={team} minute={minute} score={score} />
    </>
  );
}

function announce(fx: MomentFx, team?: string, minute?: string | null) {
  const what = {
    goal: "Goal",
    yellow: "Yellow card",
    red: "Red card",
    var: "VAR check",
    penalty: "Penalty",
  }[fx.kind];
  return [what, team, minute].filter(Boolean).join(", ");
}

function Visual({
  fx,
  team,
  minute,
  score,
}: {
  fx: MomentFx;
  team: { name: string; color: string } | null;
  minute: string | null;
  score: { home: number; away: number } | null;
}) {
  if (fx.kind === "goal")
    return (
      <div
        key={fx.id}
        className="kl-fx-flash @container absolute inset-0 flex flex-col items-center justify-center gap-[1.5cqw] text-center"
        style={{
          background: `radial-gradient(circle, ${team?.color ?? "#fff"}ee, ${team?.color ?? "#fff"}66)`,
          color: "#0b0e14",
        }}
        aria-hidden
      >
        <span className="kl-display text-[18cqw] leading-[0.85]">Goal</span>
        <span className="kl-display text-[5cqw] leading-none">
          {[team?.name, minute].filter(Boolean).join(" · ")}
          {score ? ` · ${score.home}–${score.away}` : ""}
        </span>
        <span className="kl-fx-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      </div>
    );

  if (fx.kind === "var")
    return (
      <div key={fx.id} className="absolute inset-0 bg-black/45" aria-hidden>
        <span className="kl-fx-scan absolute inset-y-0 w-[3px] bg-white shadow-[0_0_12px_#fff]" />
        <span className="kl-display absolute right-[4%] bottom-[6%] text-sm text-white">
          VAR check
        </span>
      </div>
    );

  const tint =
    fx.kind === "yellow"
      ? "#ffce00"
      : fx.kind === "red"
        ? "#eb1414"
        : (team?.color ?? "#ff9f43");
  return (
    <div
      key={fx.id}
      className="kl-fx-tint absolute inset-0"
      style={{ background: tint, mixBlendMode: "multiply" }}
      aria-hidden
    />
  );
}
