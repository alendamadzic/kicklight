import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { localTransportWithStreaming } from "./local-streaming";
import { liveFeed } from "./recording";
import { runDueSessions } from "./tick";

// Some processes have no cron to drive sessions, so the server process itself does it every
// second: local mode (self-hosted, drives "local" sessions) and `next dev` (drives
// "remote" sessions, since Supabase Cron can only reach a deployed site).

// Short, so a stat switch reaches the lights quickly; an idle pass is one cheap claim query.
const INTERVAL_MS = 1_000;

/** Self-hosted local mode: drive "local" sessions in-process (no hot reloads in production). */
export function startLocalLoop(): void {
  const KEY = Symbol.for("kicklight.loop.local");
  const g = globalThis as Record<symbol, unknown>;
  if (g[KEY]) return;
  let running = false;
  g[KEY] = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const admin = createAdminClient();
      await runDueSessions(admin, {
        mode: "local",
        transportFor: (userId) => localTransportWithStreaming(admin, userId),
        fetchMatch: liveFeed(admin),
      });
    } catch (e) {
      console.error("local loop", (e as Error).message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  console.log("[kicklight] local mode: session loop started");
}

/**
 * Dev only: stands in for the Supabase Cron job by calling /api/cron/tick, exactly as cron does.
 * Going through the route (not an in-process call) means every pass runs the latest code:
 * this interval lives for the whole `next dev` process and never sees hot reloads itself.
 */
export function startDevRemoteLoop(): void {
  const KEY = Symbol.for("kicklight.loop.remote");
  const g = globalThis as Record<symbol, unknown>;
  if (g[KEY]) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(
      "[kicklight] dev server: KICKLIGHT_DEV_LOOP=1 needs CRON_SECRET; session loop not started",
    );
    return;
  }
  let running = false;
  g[KEY] = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetch(
        `http://localhost:${process.env.PORT ?? 3000}/api/cron/tick`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        },
      );
      if (!res.ok) console.error("remote loop", res.status, await res.text());
    } catch (e) {
      console.error("remote loop", (e as Error).message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  console.log(
    "[kicklight] dev server: session loop started (via /api/cron/tick)",
  );
}
