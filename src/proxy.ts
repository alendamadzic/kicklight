import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { readSupabaseEnv } from "@/lib/supabase/env";

// Next 16 renamed middleware to proxy. It keeps the Supabase auth cookie fresh and sends
// signed-in visitors from the landing page to their matches. Access control lives in the
// routes and in RLS, not here.
//
// getClaims() verifies the token locally (the project signs with ES256) and only calls
// Supabase Auth when the token needs refreshing, so most requests pass straight through.
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
  const { data } = await supabase.auth.getClaims();

  if (request.nextUrl.pathname === "/" && data?.claims?.sub) {
    const redirect = NextResponse.redirect(new URL("/matches", request.url));
    // Carry any refreshed session cookies over to the redirect.
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

// Public, cacheable routes (fixtures, match data, config), the cron (it has its own secret)
// and static files skip the proxy. So do router prefetches, except of the landing page,
// which must still redirect signed-in visitors.
export const config = {
  matcher: [
    "/",
    {
      source:
        "/((?!api/matches|api/fixtures|api/config|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
