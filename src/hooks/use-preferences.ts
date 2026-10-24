"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { KitOverrides } from "@/engine/colors";
import type { StatKey } from "@/engine/stats";
import { getSupabase } from "@/lib/supabase/safe-client";
import { authStore } from "./use-auth";

export interface Preferences {
  /** ESPN team ids. */
  followed_teams: string[];
  tv_delay_ms: number;
  brightness: number;
  default_stat: StatKey;
  auto_start: boolean;
  /** The strip runs right to left behind the TV; set from the strip test. */
  strip_reversed: boolean;
  /** Strip colour choices keyed by team id. */
  kit_overrides: KitOverrides;
}

export const DEFAULT_PREFERENCES: Preferences = {
  followed_teams: [],
  tv_delay_ms: 0,
  brightness: 100,
  default_stat: "auto",
  auto_start: false,
  strip_reversed: false,
  kit_overrides: {},
};

/** Signed-out choices live under the bare key; each account gets its own copy. */
const storageKey = (userId: string | null) =>
  userId ? `kl:prefs:${userId}` : "kl:prefs";

let state: Preferences = DEFAULT_PREFERENCES;
/** Whose preferences `state` holds: a user id, or null when signed out. */
let owner: string | null = null;
let started = false;
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function emit(next: Preferences) {
  state = next;
  for (const l of listeners) l();
}

function readLocal(userId: string | null): Preferences | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw)
      return {
        ...DEFAULT_PREFERENCES,
        ...(JSON.parse(raw) as Partial<Preferences>),
      };
  } catch {
    // Storage can be blocked; defaults are fine.
  }
  return null;
}

function writeLocal(userId: string | null, p: Preferences) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(p));
  } catch {
    // ignore
  }
}

async function pull(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from("preferences")
    .select(
      "followed_teams, tv_delay_ms, brightness, default_stat, auto_start, strip_reversed, kit_overrides",
    )
    .eq("user_id", userId)
    .maybeSingle();
  // The account may have changed while this was in flight.
  if (error || !data || owner !== userId) return;
  const next: Preferences = {
    ...DEFAULT_PREFERENCES,
    ...(data as Partial<Preferences>),
  };
  writeLocal(userId, next);
  emit(next);
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  const userId = owner;
  const prefs = state;
  if (!userId) return;
  pushTimer = setTimeout(async () => {
    const sb = getSupabase();
    if (!sb || owner !== userId) return;
    await sb
      .from("preferences")
      .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
  }, 400);
}

/**
 * Switch to another account's preferences. Signing in from signed out keeps what was chosen
 * on this device until the account's own row loads; one account never inherits another's.
 */
function switchOwner(userId: string | null) {
  if (pushTimer) clearTimeout(pushTimer);
  const carried = owner === null ? state : DEFAULT_PREFERENCES;
  owner = userId;
  emit(readLocal(userId) ?? (userId ? carried : DEFAULT_PREFERENCES));
  if (userId) void pull(userId);
}

function start() {
  if (started) return;
  started = true;
  emit(readLocal(null) ?? DEFAULT_PREFERENCES);
  const sync = () => {
    const { user, ready } = authStore.get();
    if (!ready) return;
    const id = user?.id ?? null;
    if (id !== owner) switchOwner(id);
  };
  authStore.subscribe(sync);
  sync();
}

const store = {
  get: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    start();
    return () => {
      listeners.delete(cb);
    };
  },
};

export function updatePreferences(patch: Partial<Preferences>) {
  const next = { ...state, ...patch };
  writeLocal(owner, next);
  emit(next);
  schedulePush();
}

export function usePreferences() {
  const prefs = useSyncExternalStore(
    store.subscribe,
    store.get,
    () => DEFAULT_PREFERENCES,
  );
  const update = useCallback(
    (patch: Partial<Preferences>) => updatePreferences(patch),
    [],
  );
  return { prefs, update };
}
