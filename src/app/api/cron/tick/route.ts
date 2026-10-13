import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fetchEspnMatch } from "@/engine/feed/espn";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { apiError, json } from "@/server/auth";
import { remoteTransportFor } from "@/server/hue-link";
import { processSession, type SessionRow } from "@/server/session";

// Called every ~10 s by Supabase Cron (pg_cron + pg_net). Claims due sessions
// atomically, runs one cycle each, and writes the result back.

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CLAIM_MS = 25_000;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorised(request)) return apiError("forbidden", 403);
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const claim = new Date(Date.now() + CLAIM_MS).toISOString();

  // Atomic claim: only rows still due get pushed forward, so overlapping ticks can't double-run.
  const { data: due, error } = await admin
    .from("sessions")
    .update({ next_due_at: claim })
    .eq("status", "active")
    .eq("mode", "remote")
    .lte("next_due_at", nowIso)
    .select(
      "id, user_id, league, event_id, stat, status, delay_ms, runner_state, light_snapshot, created_at",
    );
  if (error) return apiError("db_error", 500, error.message);

  const results = await Promise.allSettled(
    (due ?? []).map(async (s) => {
      const t = await remoteTransportFor(admin, s.user_id as string);
      if (!t) {
        await admin
          .from("sessions")
          .update({ status: "paused" })
          .eq("id", s.id);
        return { id: s.id, skipped: "not_linked" };
      }
      const row: SessionRow = {
        id: s.id as string,
        league: s.league as string,
        event_id: s.event_id as string,
        stat: s.stat as string,
        status: s.status as SessionRow["status"],
        delay_ms: s.delay_ms as number,
        runner_state: (s.runner_state ?? {}) as SessionRow["runner_state"],
        light_snapshot: s.light_snapshot,
        created_at: Date.parse(s.created_at as string),
      };
      try {
        const r = await processSession(row, {
          transport: t.transport,
          fetchMatch: (league, id) => fetchEspnMatch(league, id),
          now: Date.now,
          sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
        });
        await admin
          .from("sessions")
          .update({
            runner_state: r.update.runner_state,
            snapshot: r.update.snapshot,
            light_snapshot: r.update.light_snapshot,
            status: r.update.status,
            next_due_at: new Date(r.update.next_due_at).toISOString(),
            ...(r.update.ended ? { ended_at: new Date().toISOString() } : {}),
          })
          .eq("id", s.id);
        if (r.errors.length)
          console.error("session", s.id, r.errors.join("; "));
        return { id: s.id, errors: r.errors.length };
      } catch (e) {
        if (e instanceof HueRemoteError && e.unauthorized) {
          await admin
            .from("sessions")
            .update({ status: "paused" })
            .eq("id", s.id);
        }
        throw e;
      }
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed)
    console.error("tick failure", (f as PromiseRejectedResult).reason);
  return json({ processed: results.length, failed: failed.length });
}

export const GET = handle;
export const POST = handle;
