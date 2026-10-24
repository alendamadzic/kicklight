import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Service-role client. Bypasses RLS: server code only, never import from client components. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
