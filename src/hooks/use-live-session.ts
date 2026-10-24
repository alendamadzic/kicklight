"use client";

import { useSyncExternalStore } from "react";
import type { StatKey } from "@/engine/stats";
import type { PauseReason, SessionMirror } from "@/lib/api-types";
import { getSupabase } from "@/lib/supabase/safe-client";
import { authStore, useAuth } from "./use-auth";

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

interface State {
  session: SessionRow | null;
  loading: boolean;
}

// One store for the whole app, so the tab bar and the remote share one Realtime
// subscription and see the same row (a pause on the remote shows on the tab at once).
let state: State = { session: null, loading: true };
const listeners = new Set<() => void>();
let owner: string | null | undefined;
let stop: (() => void) | null = null;
let stopAuth: (() => void) | null = null;

function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

async function load(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb
    .from("sessions")
    .select(COLUMNS)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owner !== userId) return;
  emit({ session: (data as SessionRow | null) ?? null, loading: false });
}

function follow(userId: string | null) {
  stop?.();
  stop = null;
  owner = userId;
  const sb = getSupabase();
  if (!sb || !userId) {
    emit({ session: null, loading: false });
    return;
  }
  emit({ session: null, loading: true });
  void load(userId);
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
        const cur = state.session;
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<SessionRow>;
          if (cur && cur.id === old.id) emit({ session: null });
          return;
        }
        const row = payload.new as SessionRow;
        if (row.status === "ended") {
          if (cur && cur.id === row.id) emit({ session: null });
        } else {
          emit({ session: { ...(cur?.id === row.id ? cur : null), ...row } });
        }
      },
    )
    .subscribe();
  stop = () => void sb.removeChannel(channel);
}

function syncAuth() {
  const { user, ready } = authStore.get();
  if (!ready) return;
  const id = user?.id ?? null;
  if (id !== owner) follow(id);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    stopAuth = authStore.subscribe(syncAuth);
    syncAuth();
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      stopAuth?.();
      stopAuth = null;
      stop?.();
      stop = null;
      owner = undefined;
      state = { session: null, loading: true };
    }
  };
}

const SERVER: State = { session: null, loading: true };

/** Steer the live session. Optimistic; Realtime echoes the truth back. */
async function steer(patch: SessionPatch): Promise<boolean> {
  const sb = getSupabase();
  const cur = state.session;
  if (!sb || !cur) return false;
  emit({ session: { ...cur, ...patch } });
  const { error } = await sb.from("sessions").update(patch).eq("id", cur.id);
  if (error) {
    emit({ session: cur });
    return false;
  }
  return true;
}

const clear = () => emit({ session: null });
/** Re-read the row (e.g. right after starting a session). */
const reload = () => {
  if (typeof owner === "string") void load(owner);
};

/**
 * The signed-in user's live session row, kept current over Supabase Realtime.
 * `session` is null when nothing is live (or the user is signed out).
 */
export function useLiveSession() {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
  const { ready } = useAuth();
  return {
    session: s.session,
    loading: s.loading && ready,
    steer,
    clear,
    reload,
  };
}
