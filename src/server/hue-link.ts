import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  HueRemoteError,
  RemoteTransport,
  refreshTokens,
} from "@/lights/remote";

// Loads a user's Hue link, refreshing the OAuth token when it is close to expiry,
// and hands back a ready transport. Service-role client only.

const REFRESH_WITHIN_MS = 24 * 3_600_000;

export interface LinkRow {
  user_id: string;
  transport: "remote" | "local";
  bridge_id: string | null;
  bridge_ip: string | null;
  light_id: string | null;
  light_name: string | null;
  entertainment_config_id: string | null;
  token_expires_at: string | null;
}

export async function getLink(
  admin: SupabaseClient,
  userId: string,
): Promise<LinkRow | null> {
  const { data } = await admin
    .from("hue_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

export async function remoteTransportFor(
  admin: SupabaseClient,
  userId: string,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<{ transport: RemoteTransport; link: LinkRow } | null> {
  const link = await getLink(admin, userId);
  if (!link || link.transport !== "remote") return null;
  const { data: sec } = await admin
    .from("hue_secrets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sec?.access_token_enc || !sec.app_key_enc) return null;

  let accessToken = decrypt(sec.access_token_enc as string);
  const appKey = decrypt(sec.app_key_enc as string);
  const now = opts.now ?? Date.now();
  const expiresAt = link.token_expires_at
    ? Date.parse(link.token_expires_at)
    : 0;

  if (expiresAt - now < REFRESH_WITHIN_MS && sec.refresh_token_enc) {
    const clientId = process.env.HUE_CLIENT_ID;
    const clientSecret = process.env.HUE_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new Error("HUE_CLIENT_ID / HUE_CLIENT_SECRET are not set");
    try {
      const t = await refreshTokens(
        decrypt(sec.refresh_token_enc as string),
        { clientId, clientSecret },
        opts.fetchImpl,
        now,
      );
      accessToken = t.accessToken;
      await admin
        .from("hue_secrets")
        .update({
          access_token_enc: encrypt(t.accessToken),
          refresh_token_enc: encrypt(t.refreshToken),
        })
        .eq("user_id", userId);
      const iso = new Date(t.expiresAt).toISOString();
      await admin
        .from("hue_links")
        .update({ token_expires_at: iso })
        .eq("user_id", userId);
      link.token_expires_at = iso;
    } catch (e) {
      // Refresh failed: carry on with the current token if it still works; the caller sees a 401 otherwise.
      if (!(e instanceof HueRemoteError)) throw e;
    }
  }

  const { data: prefs } = await admin
    .from("preferences")
    .select("brightness")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    link,
    transport: new RemoteTransport({
      accessToken,
      appKey,
      lightId: link.light_id ?? undefined,
      brightness: (prefs?.brightness as number | undefined) ?? 100,
      fetchImpl: opts.fetchImpl,
    }),
  };
}
