"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Browser Supabase client: auth, Realtime on `sessions`, and the user's own rows. */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
