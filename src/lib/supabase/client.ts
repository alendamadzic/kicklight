"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client: auth, Realtime on `sessions`, and the user's own rows. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set");
  }
  return createBrowserClient(url, key);
}
