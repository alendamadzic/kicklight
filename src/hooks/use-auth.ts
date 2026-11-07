"use client";

import { useSyncExternalStore } from "react";
import {
  hasSessionCookie,
  loadSupabase,
  supabaseConfigured,
} from "@/lib/supabase/safe-client";

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

let listening = false;

const toUser = (
  u: { id: string; email?: string | null } | null | undefined,
): AuthUser | null => (u ? { id: u.id, email: u.email ?? null } : null);

/**
 * Load the Supabase client and follow the session from then on. Starts on its own when the
 * browser holds a session cookie; the sign-in form calls it too, so a visitor who signs in
 * is noticed without the client ever loading for those who don't.
 */
export function listenForAuth() {
  if (listening) return;
  listening = true;
  void loadSupabase().then((sb) => {
    if (!sb) {
      set({ user: null, ready: true, configured: false });
      return;
    }
    sb.auth
      .getSession()
      .then(({ data }) =>
        set({
          user: toUser(data.session?.user),
          ready: true,
          configured: true,
        }),
      )
      .catch(() => set({ user: null, ready: true, configured: true }));
    sb.auth.onAuthStateChange((_event, session) => {
      set({ user: toUser(session?.user), ready: true, configured: true });
    });
  });
}

function start() {
  if (started) return;
  started = true;
  if (!supabaseConfigured()) {
    set({ user: null, ready: true, configured: false });
    return;
  }
  if (hasSessionCookie()) {
    listenForAuth();
    return;
  }
  // No session cookie: signed out, and nothing to load until they sign in.
  if (!state.ready) set({ user: null, ready: true, configured: true });
}

/**
 * The signed-in user as the server saw it, so the app knows who you are before the browser
 * has checked. The browser's own check still runs and has the last word.
 */
export function seedAuth(user: AuthUser | null) {
  if (state.ready) return;
  set({ user, ready: true, configured: true });
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
  const sb = await loadSupabase();
  if (sb) await sb.auth.signOut();
}
