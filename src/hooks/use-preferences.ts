"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { StatKey } from "@/engine/stats";
import { getSupabase } from "@/lib/supabase/safe-client";
import { authStore } from "./use-user";

export interface Preferences {
  /** ESPN team ids. */
  followed_teams: string[];
  tv_delay_ms: number;
  brightness: number;
  default_stat: StatKey;
  auto_start: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  followed_teams: [],
  tv_delay_ms: 0,
  brightness: 100,
  default_stat: "auto",
  auto_start: false,
};

const KEY = "kl:prefs";
const TEAMS_KEY = "kl:teams";

let state: Preferences = DEFAULT_PREFERENCES;
let loadedFor: string | null = null;
let started = false;
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function emit(next: Preferences) {
  state = next;
  for (const l of listeners) l();
}

function readLocal(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw)
      return {
        ...DEFAULT_PREFERENCES,
        ...(JSON.parse(raw) as Partial<Preferences>),
      };
  } catch {
    // Storage can be blocked; defaults are fine.
  }
  return DEFAULT_PREFERENCES;
}

function writeLocal(p: Preferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

async function pull(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from("preferences")
    .select("followed_teams, tv_delay_ms, brightness, default_stat, auto_start")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return;
  const next: Preferences = {
    ...DEFAULT_PREFERENCES,
    ...(data as Partial<Preferences>),
  };
  writeLocal(next);
  emit(next);
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const { user } = authStore.get();
    const sb = getSupabase();
    if (!user || !sb) return;
    await sb
      .from("preferences")
      .upsert({ user_id: user.id, ...state }, { onConflict: "user_id" });
  }, 400);
}

function start() {
  if (started) return;
  started = true;
  emit(readLocal());
  const sync = () => {
    const { user } = authStore.get();
    if (user && loadedFor !== user.id) {
      loadedFor = user.id;
      void pull(user.id);
    }
    if (!user) loadedFor = null;
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
  writeLocal(next);
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

// A small id -> team cache, so settings can show names for followed team ids.
export interface CachedTeam {
  id: string;
  name: string;
  short: string;
  color: string;
}

export function rememberTeams(teams: CachedTeam[]) {
  try {
    const cur = JSON.parse(localStorage.getItem(TEAMS_KEY) ?? "{}") as Record<
      string,
      CachedTeam
    >;
    for (const t of teams) cur[t.id] = t;
    localStorage.setItem(TEAMS_KEY, JSON.stringify(cur));
  } catch {
    // ignore
  }
}

export function knownTeams(): Record<string, CachedTeam> {
  try {
    return JSON.parse(localStorage.getItem(TEAMS_KEY) ?? "{}") as Record<
      string,
      CachedTeam
    >;
  } catch {
    return {};
  }
}
