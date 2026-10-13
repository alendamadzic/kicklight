import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BridgeTlsError,
  captureBridgeCertificate,
  createBridgeFetch,
  normalizeFingerprint,
} from "./agent";

// A throwaway self-signed certificate whose CN is a bridge id, like a real bridge's.
const BRIDGE_ID = "001788FFFE123456";
let dir: string;
let cert: string;
let key: string;
let server: ReturnType<typeof Bun.serve>;
let served = 0;
let lastBody = "";
let fingerprint = "";
let haveOpenssl = true;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kicklight-tls-"));
  const r = Bun.spawnSync([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(dir, "k.pem"),
    "-out",
    join(dir, "c.pem"),
    "-days",
    "2",
    "-subj",
    `/CN=${BRIDGE_ID}`,
  ]);
  if (r.exitCode !== 0) {
    haveOpenssl = false;
    return;
  }
  cert = readFileSync(join(dir, "c.pem"), "utf8");
  key = readFileSync(join(dir, "k.pem"), "utf8");
  server = Bun.serve({
    port: 0,
    tls: { key, cert },
    async fetch(req) {
      served++;
      const url = new URL(req.url);
      lastBody = await req.text();
      if (url.pathname === "/stream") {
        return new Response(
          new ReadableStream({
            async start(c) {
              c.enqueue(new TextEncoder().encode("data: 1\n\n"));
              await Bun.sleep(30);
              c.enqueue(new TextEncoder().encode("data: 2\n\n"));
              c.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      if (url.pathname === "/slow") {
        await Bun.sleep(300);
      }
      return Response.json({ ok: true, method: req.method });
    },
  });
  const cap = await captureBridgeCertificate("127.0.0.1", {
    port: server.port,
  });
  fingerprint = cap.fingerprint;
});

afterAll(() => {
  server?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const url = (path = "/") => `https://127.0.0.1:${server.port}${path}`;
const skip = () => !haveOpenssl;

describe("fingerprints", () => {
  test("normalise colons and case", () => {
    expect(normalizeFingerprint("AB:cd:01")).toBe("abcd01");
  });
});

describe("captureBridgeCertificate", () => {
  test("returns the fingerprint and CN without sending a request", async () => {
    if (skip()) return;
    served = 0;
    const c = await captureBridgeCertificate("127.0.0.1", {
      port: server.port,
    });
    expect(c.commonName).toBe(BRIDGE_ID);
    expect(c.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(c.fingerprint).toBe(fingerprint);
    expect(served).toBe(0);
  });

  test("rejects when nothing is listening", async () => {
    await expect(
      captureBridgeCertificate("127.0.0.1", { port: 1, timeoutMs: 500 }),
    ).rejects.toBeInstanceOf(BridgeTlsError);
  });
});

describe("pinned fetch", () => {
  test("talks to the bridge when the pin matches, and never touches the global TLS flag", async () => {
    if (skip()) return;
    const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const f = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { pin: fingerprint.toUpperCase() },
    });
    const res = await f(url("/clip/v2/resource/light"), {
      method: "PUT",
      headers: {
        "hue-application-key": "k",
        "content-type": "application/json",
      },
      body: JSON.stringify({ on: { on: true } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, method: "PUT" });
    expect(lastBody).toBe('{"on":{"on":true}}');
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(before);
    f.close();
  });

  test("a different certificate is refused before any request is sent", async () => {
    if (skip()) return;
    served = 0;
    const f = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { pin: "00".repeat(32) },
    });
    const err = await f(url()).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeTlsError);
    expect((err as BridgeTlsError).code).toBe("pin_mismatch");
    expect(served).toBe(0);
    f.close();
  });

  test("refuses other hosts and http", async () => {
    const f = createBridgeFetch({
      ip: "192.168.1.225",
      trust: { pin: "00".repeat(32) },
    });
    const a = await f("https://example.com/").catch((e) => e);
    expect((a as BridgeTlsError).code).toBe("wrong_host");
    const b = await f("http://192.168.1.225/").catch((e) => e);
    expect((b as BridgeTlsError).code).toBe("wrong_host");
  });

  test("needs a pin or a CA", () => {
    expect(() => createBridgeFetch({ ip: "1.2.3.4", trust: {} })).toThrow(
      BridgeTlsError,
    );
  });

  test("verifies against a supplied CA using the bridge id as server name", async () => {
    if (skip()) return;
    const good = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { ca: cert, bridgeId: BRIDGE_ID },
    });
    expect((await good(url())).status).toBe(200);
    good.close();

    const bad = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { ca: cert, bridgeId: "AAAAAAAAAAAAAAAA" },
    });
    await expect(bad(url())).rejects.toBeInstanceOf(BridgeTlsError);
    bad.close();
  });

  test("streams bodies for the event stream", async () => {
    if (skip()) return;
    const f = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { pin: fingerprint },
    });
    const res = await f(url("/stream"), { timeoutMs: 0 });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe("data: 1\n\ndata: 2\n\n");
    f.close();
  });

  test("abort and timeout", async () => {
    if (skip()) return;
    const f = createBridgeFetch({
      ip: "127.0.0.1",
      port: server.port,
      trust: { pin: fingerprint },
    });
    const ac = new AbortController();
    const p = f(url("/slow"), { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow();
    await expect(f(url("/slow"), { timeoutMs: 50 })).rejects.toThrow();
    f.close();
  });
});
