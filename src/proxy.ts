import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { readSupabaseEnv } from "@/lib/supabase/env";

// Next 16 renamed middleware to proxy. This only keeps the Supabase auth cookie fresh;
// access control lives in the routes and in RLS, not here.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = readSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        for (const { name, value } of all) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of all)
          response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
