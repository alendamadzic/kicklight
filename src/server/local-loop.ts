import "server-only";
import { fetchEspnMatch } from "@/engine/feed/espn";
import { createAdminClient } from "@/lib/supabase/admin";
import { localTransportWithStreaming } from "./local-streaming";
import { runDueSessions } from "./tick";

// Local mode has no cron: the server process itself drives due sessions every few seconds.

const INTERVAL_MS = 5_000;
const KEY = Symbol.for("kicklight.localLoop");

export function startLocalLoop(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[KEY]) return; // survive dev-server hot reloads without doubling up
  let running = false;
  g[KEY] = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const admin = createAdminClient();
      await runDueSessions(admin, {
        mode: "local",
        transportFor: (userId) => localTransportWithStreaming(admin, userId),
        fetchMatch: (league, id) => fetchEspnMatch(league, id),
      });
    } catch (e) {
      console.error("local loop", (e as Error).message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  console.log("[kicklight] local mode: session loop started");
}
