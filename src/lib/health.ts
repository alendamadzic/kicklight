import type { Route } from "next";
import type { HueStatus, PauseReason } from "@/lib/api-types";

/** The Hue link counts as at risk once it's within this of expiring (refresh should have run by then). */
const EXPIRING_MS = 12 * 3_600_000;

export interface HealthProblem {
  tone: "warn" | "bad" | "info";
  text: string;
  fix: string;
  href: Route;
}

/** The one problem worth showing, most urgent first, or null. */
export function healthProblem(
  status: HueStatus | null,
  pauseReason: PauseReason | null,
  now = Date.now(),
): HealthProblem | null {
  if (pauseReason === "bridge_unauthorized")
    return {
      tone: "bad",
      text: "Hue stopped accepting Kicklight, so your lights are paused.",
      fix: "Relink",
      href: "/onboarding",
    };
  if (pauseReason === "no_link" || (status && !status.linked))
    return {
      tone: "bad",
      text: "Your Hue link is missing, so your lights are paused.",
      fix: "Link Hue",
      href: "/onboarding",
    };
  if (status?.linked && !status.lightId)
    return {
      tone: "info",
      text: "No strip is chosen for your lights.",
      fix: "Pick a strip",
      href: "/onboarding",
    };
  if (pauseReason === "bridge_unreachable")
    return {
      tone: "bad",
      text: "Your bridge isn't answering. Check it's plugged in and online. We'll keep trying.",
      fix: "Setup",
      href: "/setup",
    };
  if (status?.tokenExpiresAt) {
    const left = Date.parse(status.tokenExpiresAt) - now;
    if (left < EXPIRING_MS)
      return {
        tone: "warn",
        text:
          left <= 0
            ? "Your Hue link has expired."
            : "Your Hue link expires soon and couldn't renew itself.",
        fix: "Relink",
        href: "/onboarding",
      };
  }
  return null;
}
