import "server-only";
import type { AppMode } from "@/lib/api-types";

// Server-side configuration from the environment. `.env.example` documents every variable.

/** A variable the feature can't work without; the error names it. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The public origin, without a trailing slash (OAuth redirects are built from it). */
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

/** Cloud (Vercel + Hue Remote API) unless self-hosted with KICKLIGHT_MODE=local. */
export const appMode = (): AppMode =>
  process.env.KICKLIGHT_MODE === "local" ? "local" : "cloud";

/** Hue Remote API app credentials, cloud mode only. */
export const hueClientCredentials = () => ({
  clientId: requireEnv("HUE_CLIENT_ID"),
  clientSecret: requireEnv("HUE_CLIENT_SECRET"),
});
