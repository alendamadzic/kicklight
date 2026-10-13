// Pairing with a bridge: the user presses the link button, we POST /api and get an
// application key (`username`) plus a `clientkey` (the Entertainment PSK, hex).
// The certificate is captured trust-on-first-use before the key is requested, so the
// credentials are only ever sent to a connection we can pin afterwards.

import {
  type BridgeFetch,
  type CapturedCertificate,
  captureBridgeCertificate,
  createBridgeFetch,
  type FetchLike,
} from "./agent";

export interface PairingCredentials {
  /** The application key: `hue-application-key` header on every CLIP v2 call. */
  username: string;
  /** Hex PSK for Entertainment streaming. */
  clientkey: string;
}

export type PairingErrorCode =
  | "link_button_not_pressed"
  | "timeout"
  | "bridge_error"
  | "bad_response";

export class PairingError extends Error {
  constructor(
    readonly code: PairingErrorCode,
    message: string,
    readonly hueType?: number,
  ) {
    super(message);
    this.name = "PairingError";
  }
}

/** `kicklight#<name>`, trimmed to Hue's 40 char limit and a safe alphabet. */
export function deviceType(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "server";
  return `kicklight#${clean}`.slice(0, 40);
}

/** One POST /api attempt. Throws PairingError("link_button_not_pressed") on Hue error 101. */
export async function pairOnce(
  ip: string,
  fetchFn: FetchLike,
  name = "local",
): Promise<PairingCredentials> {
  let res: Response;
  try {
    res = await fetchFn(`https://${ip}/api`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        devicetype: deviceType(name),
        generateclientkey: true,
      }),
    });
  } catch (e) {
    throw new PairingError("bridge_error", (e as Error).message);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PairingError("bad_response", `HTTP ${res.status}, not JSON`);
  }
  const first = Array.isArray(body) ? body[0] : null;
  const ok = first?.success;
  if (ok?.username && ok?.clientkey) {
    return { username: String(ok.username), clientkey: String(ok.clientkey) };
  }
  const err = first?.error;
  if (err?.type === 101) {
    throw new PairingError(
      "link_button_not_pressed",
      "Press the link button on the bridge, then try again",
      101,
    );
  }
  if (err) {
    throw new PairingError(
      "bridge_error",
      String(err.description ?? "bridge refused pairing"),
      typeof err.type === "number" ? err.type : undefined,
    );
  }
  if (ok?.username) {
    throw new PairingError(
      "bad_response",
      "bridge returned no clientkey (generateclientkey unsupported?)",
    );
  }
  throw new PairingError(
    "bad_response",
    `unexpected response, HTTP ${res.status}`,
  );
}

export interface PairRetryOptions {
  name?: string;
  timeoutMs?: number;
  intervalMs?: number;
  /** Called before each attempt with ms remaining, for a countdown in the UI. */
  onTick?: (remainingMs: number, attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
}

/** Poll every 2 s for up to 30 s while the user walks to the bridge. */
export async function pairWithRetry(
  ip: string,
  fetchFn: FetchLike,
  opts: PairRetryOptions = {},
): Promise<PairingCredentials> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const interval = opts.intervalMs ?? 2000;
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new PairingError("timeout", "cancelled");
    opts.onTick?.(Math.max(0, deadline - now()), attempt);
    try {
      return await pairOnce(ip, fetchFn, opts.name);
    } catch (e) {
      if (!(e instanceof PairingError) || e.code !== "link_button_not_pressed")
        throw e;
      if (now() + interval > deadline) {
        throw new PairingError(
          "link_button_not_pressed",
          "The link button was not pressed in time",
          101,
        );
      }
      await sleep(interval);
    }
  }
}

export interface PairedBridge extends PairingCredentials {
  ip: string;
  /** From the certificate CN, which is what a bridge uses as its id. */
  bridgeId: string | null;
  /** Persist this: every later connection is pinned to it. */
  certFingerprint: string;
}

export interface PairBridgeDeps {
  capture?: (ip: string) => Promise<CapturedCertificate>;
  makeFetch?: (ip: string, pin: string) => BridgeFetch | FetchLike;
}

/** The whole flow: capture the certificate (TOFU), pin it, then pair with retry. */
export async function pairBridge(
  ip: string,
  opts: PairRetryOptions & { deps?: PairBridgeDeps } = {},
): Promise<PairedBridge> {
  const capture = opts.deps?.capture ?? ((a) => captureBridgeCertificate(a));
  const makeFetch =
    opts.deps?.makeFetch ??
    ((a, pin) => createBridgeFetch({ ip: a, trust: { pin } }));
  const cert = await capture(ip);
  const f = makeFetch(ip, cert.fingerprint);
  try {
    const creds = await pairWithRetry(ip, f, opts);
    return {
      ...creds,
      ip,
      bridgeId: cert.commonName ? cert.commonName.toUpperCase() : null,
      certFingerprint: cert.fingerprint,
    };
  } finally {
    (f as Partial<BridgeFetch>).close?.();
  }
}
