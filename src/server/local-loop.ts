import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { remoteTransportFor } from "./hue-link";
import { localTransportWithStreaming } from "./local-streaming";
import { liveFeed } from "./recording";
import { runDueSessions, type TickOptions } from "./tick";

// Some processes have no cron to drive sessions, so the server process itself does it every
// second: local mode (self-hosted, drives "local" sessions) and `next dev` (drives
// "remote" sessions, since Supabase Cron can only reach a deployed site).

// Short, so a stat switch reaches the lights quickly; an idle pass is one cheap claim query.
const INTERVAL_MS = 1_000;

function startLoop(mode: TickOptions["mode"], label: string): void {
  const KEY = Symbol.for(`kicklight.loop.${mode}`);
  const g = globalThis as Record<symbol, unknown>;
  if (g[KEY]) return; // survive dev-server hot reloads without doubling up
  let running = false;
  g[KEY] = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const admin = createAdminClient();
      await runDueSessions(
        admin,
        mode === "local"
          ? {
              mode,
              transportFor: (userId) =>
                localTransportWithStreaming(admin, userId),
              fetchMatch: liveFeed(admin),
            }
          : {
              mode,
              transportFor: async (userId) =>
                (await remoteTransportFor(admin, userId))?.transport ?? null,
              fetchMatch: liveFeed(admin),
              isUnauthorized: (e) =>
                e instanceof HueRemoteError && e.unauthorized,
            },
      );
    } catch (e) {
      console.error(`${mode} loop`, (e as Error).message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  console.log(`[kicklight] ${label}: session loop started`);
}

export function startLocalLoop(): void {
  startLoop("local", "local mode");
}

/** Dev only: stands in for the Supabase Cron job that calls /api/cron/tick. */
export function startDevRemoteLoop(): void {
  startLoop("remote", "dev server");
}
