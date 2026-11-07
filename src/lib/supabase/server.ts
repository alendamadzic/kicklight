import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase client bound to the request's session cookies (RLS applies as the signed-in user).
 * Works in route handlers, which can write cookies, and in Server Components, which can't.
 */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          for (const { name, value, options } of all)
            store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user, or null. Verified from the session token's signature (the project signs
 * with ES256), so this costs no round trip to Supabase Auth unless the token needs refreshing.
 * A revoked session stays valid until its access token expires.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? null };
}
