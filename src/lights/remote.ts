import type { Rgb } from "@/engine/colors";
import type { SignalFallback } from "@/engine/effects";
import { brightnessFor, orient, resampleNearest } from "./gradient";
import type { LightTransport } from "./transport";
import { rgbToXy, type Xy } from "./xy";

// Hue Remote API: the bridge reached through api.meethue.com. Every call here was
// exercised against a real bridge in the Phase 0 spike (see TASKS.md).

export const HUE_API = "https://api.meethue.com";

export class HueRemoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HueRemoteError";
  }
  /** Token rejected: refresh it, or ask the user to link again. */
  get unauthorized() {
    return this.status === 401 || this.status === 403;
  }
}

type FetchLike = typeof fetch;

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** ms since epoch. */
  expiresAt: number;
}

export function authorizeUrl(clientId: string, state: string): string {
  const u = new URL(`${HUE_API}/v2/oauth2/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: string | number;
}

async function tokenRequest(
  body: Record<string, string>,
  creds: { clientId: string; clientSecret: string },
  fetchImpl: FetchLike,
  now: number,
): Promise<OAuthTokens> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
    "base64",
  );
  const res = await fetchImpl(`${HUE_API}/v2/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res
    .json()
    .catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new HueRemoteError(
      `Hue token request failed: ${json.error ?? res.status}`,
      res.status,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: now + Number(json.expires_in) * 1000,
  };
}

export function exchangeCode(
  code: string,
  redirectUri: string,
  creds: { clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
) {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    creds,
    fetchImpl,
    now,
  );
}

/** Refresh-token grant. The standard OAuth form; not yet exercised live (tokens last ~7 days). */
export function refreshTokens(
  refreshToken: string,
  creds: { clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
) {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken },
    creds,
    fetchImpl,
    now,
  );
}

/** The remote equivalent of pressing the bridge's link button, then registering an app key. */
export async function linkBridge(
  accessToken: string,
  appName: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ appKey: string }> {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
  const lb = await fetchImpl(`${HUE_API}/route/api/0/config`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ linkbutton: true }),
  });
  if (!lb.ok)
    throw new HueRemoteError(
      `Remote link button failed (${lb.status})`,
      lb.status,
    );
  const reg = await fetchImpl(`${HUE_API}/route/api`, {
    method: "POST",
    headers,
    body: JSON.stringify({ devicetype: `kicklight#${appName}`.slice(0, 40) }),
  });
  const json = (await reg.json().catch(() => null)) as
    | { success?: { username?: string } }[]
    | null;
  const appKey = json?.[0]?.success?.username;
  if (!reg.ok || !appKey)
    throw new HueRemoteError(
      "Could not register an app key on the bridge",
      reg.status,
    );
  return { appKey };
}

export interface RemoteLightInfo {
  id: string;
  name: string;
  archetype: string;
  pointsCapable: number;
}

interface RemoteConfig {
  accessToken: string;
  appKey: string;
  lightId?: string;
  /** Gradient points the strip accepts; read from the light when unknown. */
  points?: number;
  brightness?: number;
  /** The strip is mounted the other way round: flip so home stays on the left. */
  reversed?: boolean;
  fetchImpl?: FetchLike;
}

interface LightResource {
  id: string;
  metadata: { name: string; archetype: string };
  on?: { on: boolean };
  dimming?: { brightness: number };
  gradient?: {
    points: { color: { xy: Xy } }[];
    mode: string;
    points_capable: number;
  };
}

export interface RemoteSnapshot {
  on: boolean;
  brightness: number;
  gradient?: { mode: string; points: { color: { xy: Xy } }[] };
}

export class RemoteTransport implements LightTransport {
  readonly kind = "remote" as const;
  points: number;
  private readonly f: FetchLike;

  constructor(private readonly cfg: RemoteConfig) {
    this.f = cfg.fetchImpl ?? fetch;
    this.points = cfg.points ?? 5;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.f(`${HUE_API}/route/clip/v2/resource/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.cfg.accessToken}`,
        "hue-application-key": this.cfg.appKey,
        "content-type": "application/json",
      },
    });
    if (!res.ok)
      throw new HueRemoteError(
        `Hue remote ${init.method ?? "GET"} ${path} → ${res.status}`,
        res.status,
      );
    return (await res.json()) as T;
  }

  private get lightPath() {
    if (!this.cfg.lightId) throw new Error("No light selected");
    return `light/${this.cfg.lightId}`;
  }

  async listGradientLights(): Promise<RemoteLightInfo[]> {
    const { data } = await this.req<{ data: LightResource[] }>("light");
    return data
      .filter((l) => l.gradient)
      .map((l) => ({
        id: l.id,
        name: l.metadata.name,
        archetype: l.metadata.archetype,
        pointsCapable: l.gradient?.points_capable ?? 0,
      }));
  }

  async setGradient(colors: Rgb[], transitionMs = 800): Promise<void> {
    const pts = resampleNearest(
      orient(colors, this.cfg.reversed),
      this.points,
    ).map((c) => ({
      color: { xy: rgbToXy(c) },
    }));
    await this.req(this.lightPath, {
      method: "PUT",
      body: JSON.stringify({
        on: { on: true },
        dimming: {
          brightness: brightnessFor(colors, this.cfg.brightness ?? 100),
        },
        gradient: { mode: "segmented_palette", points: pts },
        dynamics: { duration: Math.max(0, Math.round(transitionMs)) },
      }),
    });
  }

  /** Blink a light so the viewer can see which one it is. Any light on the bridge. */
  async identify(lightId = this.cfg.lightId): Promise<void> {
    if (!lightId) throw new Error("No light to identify");
    await this.req(`light/${lightId}`, {
      method: "PUT",
      body: JSON.stringify({ identify: { action: "identify" } }),
    });
  }

  async signal(s: SignalFallback): Promise<void> {
    await this.req(this.lightPath, {
      method: "PUT",
      body: JSON.stringify({
        signaling: {
          signal: s.signal,
          duration: s.durationMs,
          colors: s.colors.slice(0, 2).map((c) => ({ xy: rgbToXy(c) })),
        },
      }),
    });
  }

  async snapshot(): Promise<RemoteSnapshot> {
    const { data } = await this.req<{ data: LightResource[] }>(this.lightPath);
    const l = data[0];
    if (l.gradient?.points_capable) this.points = l.gradient.points_capable;
    return {
      on: l.on?.on ?? true,
      brightness: l.dimming?.brightness ?? 100,
      gradient: l.gradient
        ? { mode: l.gradient.mode, points: l.gradient.points }
        : undefined,
    };
  }

  async restore(snap: unknown): Promise<void> {
    const s = snap as RemoteSnapshot | null;
    if (!s) return;
    await this.req(this.lightPath, {
      method: "PUT",
      body: JSON.stringify({
        on: { on: s.on },
        dimming: { brightness: s.brightness },
        ...(s.gradient
          ? { gradient: { mode: s.gradient.mode, points: s.gradient.points } }
          : {}),
        dynamics: { duration: 1000 },
      }),
    });
  }
}
