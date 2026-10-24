// The public Supabase settings, read with literal names so Next can inline them in the browser.

export interface SupabasePublicEnv {
  url: string;
  key: string;
}

/** Null when this copy has no Supabase project attached (the demo still works). */
export function readSupabaseEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function supabaseEnv(): SupabasePublicEnv {
  const env = readSupabaseEnv();
  if (!env)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set",
    );
  return env;
}
