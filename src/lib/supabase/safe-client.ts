"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

let cached: SupabaseClient | null | undefined;

/**
 * The browser Supabase client, or null when the env vars are missing or the client
 * can't be built. Pages use this so they keep rendering (with fixtures) without a backend.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  try {
    cached = createClient();
  } catch {
    cached = null;
  }
  return cached;
}
