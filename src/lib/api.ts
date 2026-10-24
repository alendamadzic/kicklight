import type {
  ApiError,
  AppConfig,
  DiscoverResponse,
  FireEffectBody,
  HueLightsResponse,
  HueStatus,
  MatchesResponse,
  MatchResponse,
  PairBody,
  PairResponse,
  SelectLightBody,
  SetLightsBody,
  StartSessionBody,
  StartSessionResponse,
} from "@/lib/api-types";

/** A failed API call. `status` is 0 for network failures. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
  /** Signed out. */
  get unauthenticated() {
    return this.status === 401;
  }
  /** The route doesn't exist (yet) or the server can't be reached. */
  get unavailable() {
    return (
      this.status === 0 ||
      this.status === 404 ||
      this.status === 501 ||
      this.status >= 502
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, "network", "Couldn't reach the server");
  }
  const type = res.headers.get("content-type") ?? "";
  const body: unknown = type.includes("json")
    ? await res.json().catch(() => null)
    : null;
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      res.status,
      err.error ?? `http_${res.status}`,
      err.message,
    );
  }
  if (body == null) throw new ApiRequestError(res.status || 404, "not_json");
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

/** Typed client for the HTTP API in docs/architecture.md. Every call rejects with ApiRequestError. */
export const api = {
  config: () => request<AppConfig>("/api/config"),
  matches: (league: string, date?: string) =>
    request<MatchesResponse>(
      `/api/matches?league=${encodeURIComponent(league)}${date ? `&date=${date}` : ""}`,
    ),
  match: (league: string, id: string) =>
    request<MatchResponse>(
      `/api/matches/${encodeURIComponent(league)}/${encodeURIComponent(id)}`,
    ),
  startSession: (body: StartSessionBody) =>
    request<StartSessionResponse>("/api/sessions/start", post(body)),
  stopSession: () =>
    request<{ ok?: boolean }>("/api/sessions/stop", { method: "POST" }),
  hueStatus: () => request<HueStatus>("/api/hue/status"),
  hueLights: () => request<HueLightsResponse>("/api/hue/lights"),
  selectLight: (body: SelectLightBody) =>
    request<{ ok?: boolean }>("/api/hue/light", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  hueTest: () => request<{ ok?: boolean }>("/api/hue/test", { method: "POST" }),
  hueUnlink: () =>
    request<{ ok?: boolean }>("/api/hue/unlink", { method: "POST" }),
  setLights: (body: SetLightsBody) =>
    request<{ ok?: boolean }>("/api/lights/set", post(body)),
  fireEffect: (body: FireEffectBody) =>
    request<{ ok?: boolean }>("/api/lights/effect", post(body)),
  localDiscover: () =>
    request<DiscoverResponse>("/api/hue/local/discover", { method: "POST" }),
  localPair: (body: PairBody) =>
    request<PairResponse>("/api/hue/local/pair", post(body)),
};

/**
 * Starts the Hue login. Probes first so a missing route doesn't dump the user on a 404 page.
 * Resolves true when the browser has been sent to Hue.
 */
export async function startHueOAuth(): Promise<boolean> {
  try {
    const res = await fetch("/api/hue/oauth/start", { redirect: "manual" });
    if (
      res.type === "opaqueredirect" ||
      res.ok ||
      (res.status >= 300 && res.status < 400)
    ) {
      window.location.assign("/api/hue/oauth/start");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
