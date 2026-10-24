import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { exchangeCode, linkBridge } from "@/lights/remote";
import { siteUrl } from "@/server/config";
import { HUE_OAUTH_STATE_COOKIE, saveRemoteLink } from "@/server/hue-link";

// Hue sends the browser back here with ?code=&state=. Trade the code for tokens, link the
// bridge remotely, and keep everything encrypted at rest. Failures land on onboarding with
// an `?error=` it explains to the user.

const done = (path: string) => NextResponse.redirect(`${siteUrl()}${path}`);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(HUE_OAUTH_STATE_COOKIE)?.value;
  const clear = (res: NextResponse) => {
    res.cookies.delete({
      name: HUE_OAUTH_STATE_COOKIE,
      path: "/api/hue/oauth",
    });
    return res;
  };

  if (!code || !state || !expected || state !== expected) {
    return clear(done("/onboarding?error=state_mismatch"));
  }
  const user = await getUser();
  if (!user) return clear(done("/login?next=/onboarding"));

  const clientId = process.env.HUE_CLIENT_ID;
  const clientSecret = process.env.HUE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return clear(done("/onboarding?error=not_configured"));

  try {
    const tokens = await exchangeCode(
      code,
      `${siteUrl()}/api/hue/oauth/callback`,
      { clientId, clientSecret },
    );
    const { appKey } = await linkBridge(tokens.accessToken, "kicklight");
    await saveRemoteLink(createAdminClient(), user.id, tokens, appKey);
    return clear(done("/onboarding"));
  } catch (e) {
    console.error("hue oauth callback failed", (e as Error).message);
    return clear(done("/onboarding?error=link_failed"));
  }
}
