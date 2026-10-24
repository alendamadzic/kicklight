import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMatch } from "@/engine/model";
import { isBridgeUnauthorized } from "@/lights/errors";
import type { LightTransport } from "@/lights/transport";
import { processSession, type SessionRow } from "./session";

// Runs every due session once. Shared by the cloud cron route and the local in-process loop.

export interface TickOptions {
  /** Which sessions this runner owns: cloud cron drives "remote", the local loop drives "local". */
  mode: "remote" | "local";
  transportFor: (userId: string) => Promise<LightTransport | null>;
  fetchMatch: (league: string, id: string) => Promise<ParsedMatch>;
  /** Whether an error means the bridge rejected our credentials; such sessions are paused. */
  isUnauthorized?: (e: unknown) => boolean;
  claimMs?: number;
}

export interface TickSummary {
  processed: number;
  failed: number;
}

const COLUMNS =
  "id, user_id, league, event_id, stat, status, delay_ms, runner_state, light_snapshot, created_at";

export async function runDueSessions(
  admin: SupabaseClient,
  opts: TickOptions,
): Promise<TickSummary> {
  // Longer than a pass can run (see BUDGET_MS in session.ts), so no other runner takes it mid-pass.
  const claimMs = opts.claimMs ?? 45_000;
  // Atomic claim: only rows still due get pushed forward, so overlapping ticks can't double-run.
  const { data: due, error } = await admin
    .from("sessions")
    .update({ next_due_at: new Date(Date.now() + claimMs).toISOString() })
    .eq("status", "active")
    .eq("mode", opts.mode)
    .lte("next_due_at", new Date().toISOString())
    .select(COLUMNS);
  if (error) throw new Error(`claim failed: ${error.message}`);

  const results = await Promise.allSettled(
    (due ?? []).map(async (s) => {
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
        const transport = await opts.transportFor(s.user_id as string);
        if (!transport) {
          await admin
            .from("sessions")
            .update({ status: "paused" })
            .eq("id", s.id);
          return;
        }
        const r = await processSession(row, {
          transport,
          fetchMatch: opts.fetchMatch,
          now: Date.now,
          sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
          publish: async (snapshot) => {
            const { error } = await admin
              .from("sessions")
              .update({ snapshot })
              .eq("id", s.id);
            if (error) throw new Error(error.message);
          },
        });
        const { error: saveError } = await admin
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
        if (saveError) throw new Error(`save failed: ${saveError.message}`);
        if (r.errors.length)
          console.error("session", s.id, r.errors.join("; "));
      } catch (e) {
        if ((opts.isUnauthorized ?? isBridgeUnauthorized)(e)) {
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
  return { processed: results.length, failed: failed.length };
}
