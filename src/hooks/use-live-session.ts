"use client";

import { useCallback, useEffect, useState } from "react";
import type { StatKey } from "@/engine/stats";
import type { PauseReason, SessionMirror } from "@/lib/api-types";
import { getSupabase } from "@/lib/supabase/safe-client";
import { useAuth } from "./use-auth";

/** A row of `public.sessions` as the phone sees it. */
export interface SessionRow {
  id: string;
  league: string;
  event_id: string;
  stat: StatKey;
  status: "active" | "paused" | "ended";
  mode: "remote" | "local";
  delay_ms: number;
  snapshot: SessionMirror | null;
  /** Set by the server when it paused the session itself. */
  pause_reason: PauseReason | null;
  updated_at: string;
}

const COLUMNS =
  "id, league, event_id, stat, status, mode, delay_ms, snapshot, pause_reason, updated_at";

export type SessionPatch = Partial<
  Pick<SessionRow, "stat" | "status" | "delay_ms">
>;

/**
 * Subscribes to the signed-in user's live session row over Supabase Realtime.
 * `session` is null when nothing is live (or the user is signed out).
 */
export function useLiveSession() {
  const { user, ready } = useAuth();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = user?.id ?? null;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!ready) return;
    // `nonce` re-runs the initial load (e.g. right after starting a session).
    void nonce;
    const sb = getSupabase();
    if (!sb || !userId) {
      setSession(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await sb
        .from("sessions")
        .select(COLUMNS)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setSession((data as SessionRow | null) ?? null);
      setLoading(false);
    };
    void load();

    const channel = sb
      .channel(`sessions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<SessionRow>;
            setSession((cur) => (cur && cur.id === old.id ? null : cur));
            return;
          }
          const row = payload.new as SessionRow;
          if (row.status === "ended") {
            setSession((cur) => (cur && cur.id === row.id ? null : cur));
          } else {
            setSession((cur) => ({
              ...(cur?.id === row.id ? cur : null),
              ...row,
            }));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [ready, userId, nonce]);

  /** Steer the live session. Optimistic; Realtime echoes the truth back. */
  const steer = useCallback(
    async (patch: SessionPatch) => {
      const sb = getSupabase();
      const cur = session;
      if (!sb || !cur) return false;
      setSession({ ...cur, ...patch });
      const { error } = await sb
        .from("sessions")
        .update(patch)
        .eq("id", cur.id);
      if (error) {
        setSession(cur);
        return false;
      }
      return true;
    },
    [session],
  );

  const clear = useCallback(() => setSession(null), []);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { session, loading: loading && ready, steer, clear, reload };
}
