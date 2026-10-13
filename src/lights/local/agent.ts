// TLS for one Hue bridge, and only that bridge.
//
// A bridge serves HTTPS with a certificate issued by Signify's private "root-bridge" CA
// (subject CN = the bridge id, e.g. C42996FFFEC6FCDA). No public CA vouches for it, so
// there are two honest ways to trust it:
//
//   1. Trust on first use: capture the certificate's SHA-256 fingerprint while pairing,
//      store it, and refuse any later connection that presents a different certificate.
//   2. Verify the chain against a CA PEM you supply (Signify's root, from the Hue
//      developer documentation). The bridge id is used as the TLS server name.
//
// Neither sets NODE_TLS_REJECT_UNAUTHORIZED. The relaxed handshake exists only inside the
// socket we create for the one bridge host, and in pin mode every connection is checked
// against the pin before a single request byte is written.
//
// Why node:https with a custom agent and not `fetch(url, { tls })`: measured on Bun 1.4.2,
// fetch calls `checkServerIdentity` but ignores its return value, so a rejecting callback
// still yields a 200. A custom `createConnection` that destroys the socket on a pin
// mismatch behaves the same on Bun and Node, and nothing reaches the wire on a mismatch.

import { createHash } from "node:crypto";
import { Agent, request as httpsRequest } from "node:https";
import { type TLSSocket, connect as tlsConnect } from "node:tls";

export type BridgeRequestInit = RequestInit & {
  /** Abort after this many ms without a response. 0 disables (event stream). Default 10 s. */
  timeoutMs?: number;
};

/** The subset of `fetch` the local libraries use; a fake fetch drops straight in for tests. */
export type FetchLike = (
  input: string | URL,
  init?: BridgeRequestInit,
) => Promise<Response>;

/** A pinned fetch. `close()` drops idle keep-alive sockets. */
export type BridgeFetch = FetchLike & { close(): void };

export interface BridgeTrust {
  /** SHA-256 fingerprint of the bridge certificate. Hex; colons and case are ignored. */
  pin?: string;
  /** CA certificate PEM to verify the chain against (Signify "root-bridge"). */
  ca?: string;
  /** Bridge id. Used as the TLS server name when verifying against `ca`. */
  bridgeId?: string;
}

export interface BridgeFetchOptions {
  /** The bridge's address. Requests to any other host are refused. */
  ip: string;
  port?: number;
  trust: BridgeTrust;
}

export class BridgeTlsError extends Error {
  constructor(
    readonly code: "pin_mismatch" | "no_trust" | "wrong_host" | "tls",
    message: string,
  ) {
    super(message);
    this.name = "BridgeTlsError";
  }
}

/** "AB:CD:..." or "abcd..." to lowercase hex without separators. */
export function normalizeFingerprint(fp: string): string {
  return fp.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

/** SHA-256 of a DER certificate as lowercase hex (what we store as the pin). */
export function fingerprintOfDer(der: Uint8Array): string {
  return createHash("sha256").update(der).digest("hex");
}

export interface CapturedCertificate {
  /** Lowercase hex SHA-256 of the DER certificate: persist this as the pin. */
  fingerprint: string;
  /** Subject common name. On a bridge this is the bridge id. */
  commonName: string | null;
  issuerCommonName: string | null;
  validTo: string;
}

/**
 * Trust-on-first-use capture. Opens a TLS connection without validating the chain and
 * returns the certificate presented. Sends no application data. Call it once while
 * pairing, store the fingerprint, then use `createBridgeFetch` with it.
 */
export function captureBridgeCertificate(
  ip: string,
  opts: { port?: number; timeoutMs?: number } = {},
): Promise<CapturedCertificate> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      fn();
    };
    const socket = tlsConnect({
      host: ip,
      port: opts.port ?? 443,
      // Scoped to this one socket, and no data is exchanged: we only read the certificate.
      rejectUnauthorized: false,
    });
    socket.setTimeout(opts.timeoutMs ?? 5000, () => {
      finish(() =>
        reject(new BridgeTlsError("tls", `timeout talking to ${ip}`)),
      );
      socket.destroy();
    });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.raw) {
        finish(() =>
          reject(new BridgeTlsError("tls", "bridge presented no certificate")),
        );
        return;
      }
      finish(() =>
        resolve({
          fingerprint: fingerprintOfDer(cert.raw),
          commonName: asString(cert.subject?.CN),
          issuerCommonName: asString(cert.issuer?.CN),
          validTo: cert.valid_to,
        }),
      );
    });
    socket.once("error", (e: Error) =>
      finish(() => reject(new BridgeTlsError("tls", e.message))),
    );
  });
}

const asString = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

class PinnedAgent extends Agent {
  constructor(
    private readonly pin: string | null,
    private readonly ca: string | null,
    private readonly serverName: string | null,
  ) {
    super({ keepAlive: true, maxSockets: 4 });
  }

  // node:https calls this to open the socket for each new connection.
  override createConnection(
    options: { host?: string; port?: number },
    // biome-ignore lint/suspicious/noExplicitAny: matches the http.Agent signature
    _cb?: any,
  ): TLSSocket {
    const verifyChain = this.ca != null;
    const socket = tlsConnect({
      host: options.host,
      port: options.port,
      ca: this.ca ?? undefined,
      servername: this.serverName ?? undefined,
      // With a CA we validate the chain. With a pin alone we skip chain validation for this
      // socket only, and the pin check below is what authenticates the bridge.
      rejectUnauthorized: verifyChain,
    });
    const pin = this.pin;
    if (pin) {
      socket.once("secureConnect", () => {
        const cert = socket.getPeerCertificate();
        const fp = cert?.raw ? fingerprintOfDer(cert.raw) : "";
        if (fp !== pin) {
          socket.destroy(
            new BridgeTlsError(
              "pin_mismatch",
              "bridge certificate does not match the pinned fingerprint",
            ),
          );
        }
      });
    }
    return socket;
  }
}

/**
 * A fetch that only talks to `ip` and only over a connection that passed the trust check.
 * Returns a real `Response`, streaming, so it also serves the event stream.
 */
export function createBridgeFetch(opts: BridgeFetchOptions): BridgeFetch {
  const pin = opts.trust.pin ? normalizeFingerprint(opts.trust.pin) : null;
  const ca = opts.trust.ca ?? null;
  if (!pin && !ca) {
    throw new BridgeTlsError(
      "no_trust",
      "createBridgeFetch needs a pin or a CA; capture one with captureBridgeCertificate at pairing",
    );
  }
  const agent = new PinnedAgent(
    pin,
    ca,
    ca ? (opts.trust.bridgeId ?? null) : null,
  );
  const port = opts.port ?? 443;

  const doFetch: FetchLike = (input, init = {}) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.protocol !== "https:" || url.hostname !== opts.ip) {
        reject(
          new BridgeTlsError(
            "wrong_host",
            `this client only talks to https://${opts.ip}`,
          ),
        );
        return;
      }
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => {
        headers[k] = v;
      });
      const body = toBuffer(init.body);
      if (body && headers["content-length"] == null) {
        headers["content-length"] = String(body.length);
      }
      const req = httpsRequest(
        {
          agent,
          host: url.hostname,
          port: Number(url.port) || port,
          path: url.pathname + url.search,
          method: init.method ?? "GET",
          headers,
        },
        (res) => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) for (const x of v) h.append(k, x);
            else if (v != null) h.set(k, v);
          }
          const status = res.statusCode ?? 0;
          const noBody = status === 204 || status === 304 || status < 200;
          const stream = noBody
            ? null
            : new ReadableStream<Uint8Array>({
                start(c) {
                  res.on("data", (d: Buffer) => c.enqueue(new Uint8Array(d)));
                  res.on("end", () => c.close());
                  res.on("error", (e) => c.error(e));
                },
                cancel() {
                  res.destroy();
                  req.destroy();
                },
              });
          if (noBody) res.resume();
          resolve(new Response(stream, { status, headers: h }));
        },
      );
      req.on("error", (e) =>
        reject(
          e instanceof BridgeTlsError
            ? e
            : new BridgeTlsError("tls", e.message),
        ),
      );
      const timeoutMs = init.timeoutMs ?? 10_000;
      if (timeoutMs > 0) {
        req.setTimeout(timeoutMs, () =>
          req.destroy(
            new BridgeTlsError("tls", `timeout after ${timeoutMs} ms`),
          ),
        );
      }
      const signal = init.signal;
      if (signal) {
        if (signal.aborted) {
          req.destroy(abortError());
          return;
        }
        signal.addEventListener("abort", () => req.destroy(abortError()), {
          once: true,
        });
      }
      req.end(body ?? undefined);
    });
  return Object.assign(doFetch, { close: () => agent.destroy() });
}

const abortError = () => {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
};

function toBuffer(body: BodyInit | null | undefined): Buffer | null {
  if (body == null) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError("bridge fetch supports string and binary bodies only");
}
