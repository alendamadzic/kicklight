import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A minimal server Supabase client for the auth callback route only: it reads the
 * PKCE verifier cookie and writes the session cookies. Everything else on the server
 * uses `src/lib/supabase/server.ts` (owned by the core track).
 */
export async function createRouteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
