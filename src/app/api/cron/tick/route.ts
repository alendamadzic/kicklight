import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fetchEspnMatch } from "@/engine/feed/espn";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { apiError, json } from "@/server/auth";
import { remoteTransportFor } from "@/server/hue-link";
import { runDueSessions } from "@/server/tick";

// Called every ~10 s by Supabase Cron (pg_cron + pg_net). The work itself is in
// src/server/tick.ts, which the local-mode loop shares.

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorised(request)) return apiError("forbidden", 403);
  try {
    const admin = createAdminClient();
    const summary = await runDueSessions(admin, {
      mode: "remote",
      transportFor: async (userId) =>
        (await remoteTransportFor(admin, userId))?.transport ?? null,
      fetchMatch: (league, id) => fetchEspnMatch(league, id),
      isUnauthorized: (e) => e instanceof HueRemoteError && e.unauthorized,
    });
    return json(summary);
  } catch (e) {
    return apiError("tick_failed", 500, (e as Error).message);
  }
}

export const GET = handle;
export const POST = handle;
