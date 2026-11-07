"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";

let pending: Promise<SupabaseClient | null> | undefined;

/**
 * The browser Supabase client, loaded on first use: it is a large bundle (auth, Realtime,
 * PostgREST) that signed-out pages never need. Resolves to null when the env vars are
 * missing or the client can't be built, so pages keep rendering (with fixtures) without a
 * backend.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  pending ??= readSupabaseEnv()
    ? import("@/lib/supabase/client")
        .then((m) => m.createClient())
        .catch(() => null)
    : Promise.resolve(null);
  return pending;
}

/** True when this copy has a Supabase project attached. */
export const supabaseConfigured = () => readSupabaseEnv() !== null;

/**
 * Whether the browser holds a Supabase session cookie (`sb-<ref>-auth-token`, possibly split
 * into `.0`, `.1` chunks). Without one the visitor is signed out, no client needed.
 */
export function hasSessionCookie(): boolean {
  try {
    return /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/.test(document.cookie);
  } catch {
    return false;
  }
}
