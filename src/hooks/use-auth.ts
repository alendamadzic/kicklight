"use client";

import { useSyncExternalStore } from "react";
import { getSupabase } from "@/lib/supabase/safe-client";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  /** False until the first session check has finished. */
  ready: boolean;
  /** False when Supabase isn't configured: the app runs on fixtures only. */
  configured: boolean;
}

const SERVER_STATE: AuthState = { user: null, ready: false, configured: true };
let state: AuthState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

function start() {
  if (started) return;
  started = true;
  const sb = getSupabase();
  if (!sb) {
    set({ user: null, ready: true, configured: false });
    return;
  }
  const toUser = (
    u: { id: string; email?: string | null } | null | undefined,
  ): AuthUser | null => (u ? { id: u.id, email: u.email ?? null } : null);
  sb.auth
    .getSession()
    .then(({ data }) =>
      set({ user: toUser(data.session?.user), ready: true, configured: true }),
    )
    .catch(() => set({ user: null, ready: true, configured: true }));
  sb.auth.onAuthStateChange((_event, session) => {
    set({ user: toUser(session?.user), ready: true, configured: true });
  });
}

export const authStore = {
  get: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    start();
    return () => {
      listeners.delete(cb);
    };
  },
};

export function useAuth(): AuthState {
  return useSyncExternalStore(
    authStore.subscribe,
    authStore.get,
    () => SERVER_STATE,
  );
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
