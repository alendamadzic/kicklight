import Link from "next/link";
import type { HealthProblem } from "@/lib/health";

const TONE = {
  warn: "border-amber/50 bg-amber/10 [--tone:var(--amber)]",
  bad: "border-destructive/50 bg-destructive/10 [--tone:var(--destructive)]",
  info: "border-border bg-muted [--tone:var(--chart-2)]",
};

/** A one-line problem with its fix, at the top of the remote. */
export function RemoteHealthBanner({
  problem,
}: {
  problem: HealthProblem | null;
}) {
  if (!problem) return null;
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${TONE[problem.tone]}`}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--tone)" />
      <span className="min-w-0 flex-1 text-sm">{problem.text}</span>
      <Link
        href={problem.href}
        className="shrink-0 text-sm font-semibold whitespace-nowrap text-(--tone)"
      >
        {problem.fix} ›
      </Link>
    </div>
  );
}
