import { type NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { exchangeCode, linkBridge } from "@/lights/remote";
import { siteUrl } from "@/server/auth";

// Hue sends the browser back here with ?code=&state=. Trade the code for tokens,
// link the bridge remotely, and keep everything encrypted at rest.

const done = (path: string) => NextResponse.redirect(`${siteUrl()}${path}`);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("hue_oauth_state")?.value;
  const clear = (res: NextResponse) => {
    res.cookies.delete({ name: "hue_oauth_state", path: "/api/hue/oauth" });
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
      {
        clientId,
        clientSecret,
      },
    );
    const { appKey } = await linkBridge(tokens.accessToken, "kicklight");
    const admin = createAdminClient();
    const { error: linkErr } = await admin.from("hue_links").upsert({
      user_id: user.id,
      transport: "remote",
      token_expires_at: new Date(tokens.expiresAt).toISOString(),
      // A fresh link invalidates any earlier light choice.
      light_id: null,
      light_name: null,
    });
    if (linkErr) throw linkErr;
    const { error: secErr } = await admin.from("hue_secrets").upsert({
      user_id: user.id,
      app_key_enc: encrypt(appKey),
      access_token_enc: encrypt(tokens.accessToken),
      refresh_token_enc: encrypt(tokens.refreshToken),
    });
    if (secErr) throw secErr;
    return clear(done("/onboarding?step=light"));
  } catch (e) {
    console.error("hue oauth callback failed", (e as Error).message);
    return clear(done("/onboarding?error=link_failed"));
  }
}
