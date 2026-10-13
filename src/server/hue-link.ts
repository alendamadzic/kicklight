import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HueLightInfo } from "@/lib/api-types";
import { decrypt, encrypt } from "@/lib/crypto";
import { createBridgeFetch } from "@/lights/local/agent";
import { LocalTransport, listGradientLights } from "@/lights/local/transport";
import {
  HueRemoteError,
  RemoteTransport,
  refreshTokens,
} from "@/lights/remote";
import type { LightTransport } from "@/lights/transport";

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
  cert_fingerprint: string | null;
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

/** A LAN transport pinned to the bridge's certificate. Local mode only. */
export async function localTransportFor(
  admin: SupabaseClient,
  userId: string,
): Promise<{ transport: LocalTransport; link: LinkRow } | null> {
  const link = await getLink(admin, userId);
  if (!link || link.transport !== "local") return null;
  if (!link.bridge_ip || !link.cert_fingerprint || !link.light_id) return null;
  const { data: sec } = await admin
    .from("hue_secrets")
    .select("app_key_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sec?.app_key_enc) return null;
  const { data: prefs } = await admin
    .from("preferences")
    .select("brightness")
    .eq("user_id", userId)
    .maybeSingle();
  const fetch = createBridgeFetch({
    ip: link.bridge_ip,
    trust: { pin: link.cert_fingerprint },
  });
  const transport = await LocalTransport.connect({
    fetch,
    ip: link.bridge_ip,
    applicationKey: decrypt(sec.app_key_enc as string),
    lightId: link.light_id,
    brightness: (prefs?.brightness as number | undefined) ?? 100,
  });
  return { transport, link };
}

/** The user's transport, whichever way their bridge is linked. */
export async function transportFor(
  admin: SupabaseClient,
  userId: string,
): Promise<{ transport: LightTransport; link: LinkRow } | null> {
  const link = await getLink(admin, userId);
  if (!link) return null;
  return link.transport === "local"
    ? localTransportFor(admin, userId)
    : remoteTransportFor(admin, userId);
}

/** Gradient-capable lights on the linked bridge, for the strip picker. */
export async function listLightsFor(
  admin: SupabaseClient,
  userId: string,
): Promise<HueLightInfo[] | null> {
  const link = await getLink(admin, userId);
  if (!link) return null;
  if (link.transport === "remote") {
    const t = await remoteTransportFor(admin, userId);
    return t ? await t.transport.listGradientLights() : null;
  }
  if (!link.bridge_ip || !link.cert_fingerprint) return null;
  const { data: sec } = await admin
    .from("hue_secrets")
    .select("app_key_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sec?.app_key_enc) return null;
  const fetch = createBridgeFetch({
    ip: link.bridge_ip,
    trust: { pin: link.cert_fingerprint },
  });
  const lights = await listGradientLights(
    fetch,
    link.bridge_ip,
    decrypt(sec.app_key_enc as string),
  );
  return lights.map((l) => ({
    id: l.id,
    name: l.name,
    archetype: "gradient",
    pointsCapable: l.pointsCapable,
  }));
}
