import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KitOverrides } from "@/engine/colors";
import type { HueLightInfo } from "@/lib/api-types";
import { decrypt, encrypt } from "@/lib/crypto";
import { createBridgeFetch } from "@/lights/local/agent";
import type { PairedBridge } from "@/lights/local/pairing";
import { LocalTransport, listGradientLights } from "@/lights/local/transport";
import {
  HueRemoteError,
  type OAuthTokens,
  RemoteTransport,
  refreshTokens,
} from "@/lights/remote";
import type { LightTransport } from "@/lights/transport";
import { hueClientCredentials } from "./config";
import { parseKitOverrides } from "./validate";

// A user's Hue link: which bridge and strip (`hue_links`, readable by the user) and the
// credentials for it (`hue_secrets`, encrypted, service role only). Loads and saves both,
// refreshes the cloud token when it's close to expiry, and hands back a ready transport.
// Service-role client only.

const REFRESH_WITHIN_MS = 24 * 3_600_000;

/** Ties the Hue OAuth redirect back to the browser that started it (CSRF guard). */
export const HUE_OAUTH_STATE_COOKIE = "hue_oauth_state";

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

interface SecretsRow {
  app_key_enc: string | null;
  client_key_enc: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
}

/** Everything needed to drive the user's strip, read in one go. */
export interface HueContext {
  link: LinkRow;
  secrets: SecretsRow | null;
  /** Master brightness from preferences, 1-100. */
  brightness: number;
  /** The strip runs right to left behind the TV (set during the strip test). */
  stripReversed: boolean;
  /** The viewer's strip colour choices, keyed by team id. */
  kitOverrides: KitOverrides;
}

export interface LinkedTransport<T extends LightTransport = LightTransport>
  extends HueContext {
  transport: T;
}

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

export async function getLink(
  admin: SupabaseClient,
  userId: string,
): Promise<LinkRow | null> {
  const { data, error } = await admin
    .from("hue_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  fail("read hue_links", error);
  return (data as LinkRow | null) ?? null;
}

export async function loadHueContext(
  admin: SupabaseClient,
  userId: string,
): Promise<HueContext | null> {
  const [link, secrets, prefs] = await Promise.all([
    getLink(admin, userId),
    admin
      .from("hue_secrets")
      .select(
        "app_key_enc, client_key_enc, access_token_enc, refresh_token_enc",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("preferences")
      .select("brightness, strip_reversed, kit_overrides")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  fail("read hue_secrets", secrets.error);
  fail("read preferences", prefs.error);
  if (!link) return null;
  return {
    link,
    secrets: (secrets.data as SecretsRow | null) ?? null,
    brightness: (prefs.data?.brightness as number | undefined) ?? 100,
    stripReversed: prefs.data?.strip_reversed === true,
    kitOverrides: parseKitOverrides(prefs.data?.kit_overrides),
  };
}

/** The cloud access token, refreshed first when it expires within a day. */
async function remoteAccessToken(
  admin: SupabaseClient,
  ctx: HueContext,
  opts: { fetchImpl?: typeof fetch; now?: number },
): Promise<string | null> {
  const sec = ctx.secrets;
  if (!sec?.access_token_enc) return null;
  const current = decrypt(sec.access_token_enc);
  const now = opts.now ?? Date.now();
  const expiresAt = ctx.link.token_expires_at
    ? Date.parse(ctx.link.token_expires_at)
    : 0;
  if (expiresAt - now >= REFRESH_WITHIN_MS || !sec.refresh_token_enc)
    return current;

  let tokens: OAuthTokens;
  try {
    tokens = await refreshTokens(
      decrypt(sec.refresh_token_enc),
      hueClientCredentials(),
      opts.fetchImpl,
      now,
    );
  } catch (e) {
    // Refresh failed: carry on with the current token if it still works; the caller sees a 401 otherwise.
    if (e instanceof HueRemoteError) return current;
    throw e;
  }
  const userId = ctx.link.user_id;
  const iso = new Date(tokens.expiresAt).toISOString();
  const [s, l] = await Promise.all([
    admin
      .from("hue_secrets")
      .update({
        access_token_enc: encrypt(tokens.accessToken),
        refresh_token_enc: encrypt(tokens.refreshToken),
      })
      .eq("user_id", userId),
    admin
      .from("hue_links")
      .update({ token_expires_at: iso })
      .eq("user_id", userId),
  ]);
  fail("save refreshed hue token", s.error ?? l.error);
  ctx.link.token_expires_at = iso;
  return tokens.accessToken;
}

async function remoteTransport(
  admin: SupabaseClient,
  ctx: HueContext,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<RemoteTransport | null> {
  if (ctx.link.transport !== "remote" || !ctx.secrets?.app_key_enc) return null;
  const accessToken = await remoteAccessToken(admin, ctx, opts);
  if (!accessToken) return null;
  return new RemoteTransport({
    accessToken,
    appKey: decrypt(ctx.secrets.app_key_enc),
    lightId: ctx.link.light_id ?? undefined,
    brightness: ctx.brightness,
    reversed: ctx.stripReversed,
    fetchImpl: opts.fetchImpl,
  });
}

/** LAN access to the bridge, pinned to the certificate captured at pairing. */
function localBridge(ctx: HueContext) {
  const { bridge_ip: ip, cert_fingerprint: pin } = ctx.link;
  const appKey = ctx.secrets?.app_key_enc;
  if (ctx.link.transport !== "local" || !ip || !pin || !appKey) return null;
  return {
    ip,
    applicationKey: decrypt(appKey),
    fetch: createBridgeFetch({ ip, trust: { pin } }),
  };
}

async function localTransport(ctx: HueContext): Promise<LocalTransport | null> {
  const bridge = localBridge(ctx);
  if (!bridge || !ctx.link.light_id) return null;
  return LocalTransport.connect({
    ...bridge,
    lightId: ctx.link.light_id,
    brightness: ctx.brightness,
    reversed: ctx.stripReversed,
  });
}

/** The cloud transport, for the cron tick. Null unless the user is linked through the cloud. */
export async function remoteTransportFor(
  admin: SupabaseClient,
  userId: string,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<LinkedTransport<RemoteTransport> | null> {
  const ctx = await loadHueContext(admin, userId);
  const transport = ctx && (await remoteTransport(admin, ctx, opts));
  return ctx && transport ? { ...ctx, transport } : null;
}

/** The LAN transport, for local mode. Null unless the user paired a bridge on the LAN. */
export async function localTransportFor(
  admin: SupabaseClient,
  userId: string,
): Promise<LinkedTransport<LocalTransport> | null> {
  const ctx = await loadHueContext(admin, userId);
  const transport = ctx && (await localTransport(ctx));
  return ctx && transport ? { ...ctx, transport } : null;
}

/** The user's transport, whichever way their bridge is linked. */
export async function transportFor(
  admin: SupabaseClient,
  userId: string,
): Promise<LinkedTransport | null> {
  const ctx = await loadHueContext(admin, userId);
  if (!ctx) return null;
  const transport =
    ctx.link.transport === "local"
      ? await localTransport(ctx)
      : await remoteTransport(admin, ctx);
  return transport ? { ...ctx, transport } : null;
}

/**
 * Blink one light on the linked bridge, so the viewer can tell which strip is which
 * before choosing. Works before a strip is chosen. False when there's no usable link.
 */
export async function identifyLightFor(
  admin: SupabaseClient,
  userId: string,
  lightId: string,
): Promise<boolean> {
  const ctx = await loadHueContext(admin, userId);
  if (!ctx) return false;
  if (ctx.link.transport === "remote") {
    const t = await remoteTransport(admin, ctx);
    if (!t) return false;
    await t.identify(lightId);
    return true;
  }
  const bridge = localBridge(ctx);
  if (!bridge) return false;
  await new LocalTransport({ ...bridge, lightId }).identify();
  return true;
}

/** Gradient-capable lights on the linked bridge, for the strip picker. */
export async function listLightsFor(
  admin: SupabaseClient,
  userId: string,
): Promise<HueLightInfo[] | null> {
  const ctx = await loadHueContext(admin, userId);
  if (!ctx) return null;
  if (ctx.link.transport === "remote") {
    const t = await remoteTransport(admin, ctx);
    return t ? t.listGradientLights() : null;
  }
  const bridge = localBridge(ctx);
  if (!bridge) return null;
  const lights = await listGradientLights(
    bridge.fetch,
    bridge.ip,
    bridge.applicationKey,
  );
  return lights.map((l) => ({
    id: l.id,
    name: l.name,
    archetype: "gradient",
    pointsCapable: l.pointsCapable,
  }));
}

// -- writes ------------------------------------------------------------------
// Each save writes whole rows, so relinking one way never leaves the other way's fields behind.

async function saveLink(
  admin: SupabaseClient,
  link: Omit<LinkRow, "light_id" | "light_name">,
  secrets: SecretsRow,
) {
  const { error: linkError } = await admin
    .from("hue_links")
    // A fresh link invalidates any earlier strip choice.
    .upsert({ ...link, light_id: null, light_name: null });
  fail("save hue_links", linkError);
  const { error: secretsError } = await admin
    .from("hue_secrets")
    .upsert({ user_id: link.user_id, ...secrets });
  fail("save hue_secrets", secretsError);
}

/** After the Hue cloud OAuth flow. */
export function saveRemoteLink(
  admin: SupabaseClient,
  userId: string,
  tokens: OAuthTokens,
  appKey: string,
) {
  return saveLink(
    admin,
    {
      user_id: userId,
      transport: "remote",
      bridge_id: null,
      bridge_ip: null,
      cert_fingerprint: null,
      entertainment_config_id: null,
      token_expires_at: new Date(tokens.expiresAt).toISOString(),
    },
    {
      app_key_enc: encrypt(appKey),
      client_key_enc: null,
      access_token_enc: encrypt(tokens.accessToken),
      refresh_token_enc: encrypt(tokens.refreshToken),
    },
  );
}

/** After pairing with a bridge on the LAN (local mode). */
export function saveLocalLink(
  admin: SupabaseClient,
  userId: string,
  paired: PairedBridge,
) {
  return saveLink(
    admin,
    {
      user_id: userId,
      transport: "local",
      bridge_id: paired.bridgeId,
      bridge_ip: paired.ip,
      cert_fingerprint: paired.certFingerprint,
      entertainment_config_id: null,
      token_expires_at: null,
    },
    {
      app_key_enc: encrypt(paired.username),
      client_key_enc: encrypt(paired.clientkey),
      access_token_enc: null,
      refresh_token_enc: null,
    },
  );
}

/** Choose the strip to drive. False when the user has no link to attach it to. */
export async function chooseLight(
  admin: SupabaseClient,
  userId: string,
  light: { lightId: string; lightName: string },
): Promise<boolean> {
  const { data, error } = await admin
    .from("hue_links")
    .update({ light_id: light.lightId, light_name: light.lightName })
    .eq("user_id", userId)
    .select("user_id");
  fail("save light choice", error);
  return Boolean(data?.length);
}

/** Forget the link and its credentials. */
export async function deleteLink(admin: SupabaseClient, userId: string) {
  const { error: secretsError } = await admin
    .from("hue_secrets")
    .delete()
    .eq("user_id", userId);
  fail("delete hue_secrets", secretsError);
  const { error: linkError } = await admin
    .from("hue_links")
    .delete()
    .eq("user_id", userId);
  fail("delete hue_links", linkError);
}
