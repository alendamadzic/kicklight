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

/** The signed-in user, or null. Always verified with Supabase, never trusted from the cookie alone. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
