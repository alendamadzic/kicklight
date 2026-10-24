// Hue Entertainment streaming (local mode only).
//
// 1. A bridge-side "entertainment configuration" says which light segments are channels.
// 2. `PUT entertainment_configuration/{id} {"action":"start"}` puts the bridge in streaming mode.
// 3. We open DTLS 1.2 (PSK) to UDP :2100 and send HueStream v2 frames at ~50 Hz.
// 4. `{"action":"stop"}` hands the lights back.
//
// Sources for the wire format (the Signify docs sit behind a developer login):
//   Philips Hue Entertainment API, "Streaming" (developers.meethue.com/develop/hue-entertainment/
//   philips-hue-entertainment-api/): HueStream v2 message, DTLS PSK on :2100,
//   TLS_PSK_WITH_AES_128_GCM_SHA256, PSK identity = the `hue-application-id` header returned by
//   GET https://<bridge>/auth/v1, PSK = the pairing `clientkey`.
//   Cross-checked against diyHue's receiver (github.com/diyhue/diyHue,
//   BridgeEmulator/services/entertainment.py): v2 channel entries start at byte 52 and are
//   7 bytes each, colour space at byte 14.

import type { Rgb } from "@/engine/colors";
import { resampleNearest } from "../gradient";
import type { FetchLike } from "./agent";

// ---------------------------------------------------------------------------
// HueStream v2 frame encoder
// ---------------------------------------------------------------------------

export const HUESTREAM_MAX_CHANNELS = 20;
export const HUESTREAM_HEADER_BYTES = 52;
export const HUESTREAM_CHANNEL_BYTES = 7;

export interface StreamChannel {
  /** `channel_id` from the entertainment configuration. */
  id: number;
  rgb: Rgb;
}

/**
 * Byte layout (big-endian), 52 byte header + 7 bytes per channel:
 *
 *   0..8    "HueStream"                 ASCII
 *   9..10   0x02 0x00                   API version 2.0
 *   11      sequence number             wraps at 256; the bridge ignores it
 *   12..13  0x00 0x00                   reserved
 *   14      colour space                0x00 RGB, 0x01 xy+brightness
 *   15      0x00                        reserved
 *   16..51  entertainment configuration UUID, 36 ASCII chars, no terminator
 *   52..    per channel: id (u8), R (u16), G (u16), B (u16)
 */
export function encodeHueStreamV2(
  sequence: number,
  configId: string,
  channels: StreamChannel[],
): Uint8Array {
  if (configId.length !== 36) {
    throw new RangeError(
      "entertainment configuration id must be a 36 char UUID",
    );
  }
  if (channels.length > HUESTREAM_MAX_CHANNELS) {
    throw new RangeError(
      `HueStream v2 carries at most ${HUESTREAM_MAX_CHANNELS} channels`,
    );
  }
  const out = new Uint8Array(
    HUESTREAM_HEADER_BYTES + channels.length * HUESTREAM_CHANNEL_BYTES,
  );
  const view = new DataView(out.buffer);
  for (let i = 0; i < 9; i++) out[i] = "HueStream".charCodeAt(i);
  out[9] = 0x02;
  out[10] = 0x00;
  out[11] = sequence & 0xff;
  out[12] = 0x00;
  out[13] = 0x00;
  out[14] = 0x00; // RGB
  out[15] = 0x00;
  for (let i = 0; i < 36; i++) out[16 + i] = configId.charCodeAt(i) & 0x7f;
  let o = HUESTREAM_HEADER_BYTES;
  for (const ch of channels) {
    if (!Number.isInteger(ch.id) || ch.id < 0 || ch.id > 255) {
      throw new RangeError(`bad channel id ${ch.id}`);
    }
    out[o] = ch.id;
    for (let c = 0; c < 3; c++) {
      view.setUint16(o + 1 + c * 2, to16(ch.rgb[c]), false);
    }
    o += HUESTREAM_CHANNEL_BYTES;
  }
  return out;
}

/** 0-255 to 0-65535 (v * 257 maps 255 to 65535 exactly). */
const to16 = (v: number) => Math.round(Math.min(255, Math.max(0, v))) * 257;

// ---------------------------------------------------------------------------
// Entertainment configuration (CLIP v2)
// ---------------------------------------------------------------------------

export interface EntertainmentConfig {
  id: string;
  name: string;
  /** `channel_id`s, in segment order along the strip. Stream one colour for each. */
  channelIds: number[];
  /** Bridge says another app is streaming right now. */
  active: boolean;
}

interface ConfigResource {
  id: string;
  metadata?: { name?: string };
  status?: string;
  channels?: {
    channel_id: number;
    members?: { service?: { rid: string } }[];
  }[];
  locations?: { service_locations?: { service?: { rid: string } }[] };
  light_services?: { rid: string }[];
}

interface EntertainmentService {
  id: string;
  renderer_reference?: { rid: string };
  segments?: {
    max_segments?: number;
    segments?: { start: number; length: number }[];
  };
}

export class EntertainmentError extends Error {
  constructor(
    readonly code:
      | "no_entertainment_service"
      | "create_failed"
      | "start_failed"
      | "stop_failed"
      | "no_application_id",
    message: string,
  ) {
    super(message);
    this.name = "EntertainmentError";
  }
}

interface Api {
  fetch: FetchLike;
  ip: string;
  applicationKey: string;
}

async function clip(
  api: Api,
  method: string,
  path: string,
  body?: unknown,
): Promise<{
  status: number;
  json: { data?: unknown[]; errors?: { description?: string }[] };
}> {
  const res = await api.fetch(`https://${api.ip}/clip/v2/resource/${path}`, {
    method,
    headers: {
      "hue-application-key": api.applicationKey,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const toConfig = (r: ConfigResource): EntertainmentConfig => ({
  id: r.id,
  name: r.metadata?.name ?? "Entertainment",
  channelIds: (r.channels ?? []).map((c) => c.channel_id).sort((a, b) => a - b),
  active: r.status === "active",
});

/**
 * Positions for N segments along the top edge of a screen, left to right, in Hue's
 * normalised room space (x -1..1 left to right, y -1..1 back to front, z -1..1 down to up).
 */
export function stripPositions(
  n: number,
): { x: number; y: number; z: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    x: n === 1 ? 0 : -0.9 + (1.8 * i) / (n - 1),
    y: 0.9,
    z: 0.9,
  }));
}

/**
 * Find the entertainment configuration that contains this light's entertainment service,
 * or create one ("screen" type, one position per segment).
 *
 * The create call is the part we could not exercise: the bridge under test had no
 * configuration and this track only had read access. The GET shapes below were verified
 * against the real bridge; the POST body follows the CLIP v2 reference and the resource
 * shape the bridge returns, and falls back to a minimal body if the first is rejected.
 */
export async function ensureConfiguration(
  api: Api,
  lightId: string,
  opts: { name?: string } = {},
): Promise<EntertainmentConfig> {
  const services = await clip(api, "GET", "entertainment");
  const svc = (services.json.data as EntertainmentService[] | undefined)?.find(
    (s) => s.renderer_reference?.rid === lightId,
  );
  if (!svc) {
    throw new EntertainmentError(
      "no_entertainment_service",
      "this light has no entertainment service (not streaming capable)",
    );
  }
  const segs = svc.segments?.segments?.length || 1;

  const list = await clip(api, "GET", "entertainment_configuration");
  const existing = (list.json.data as ConfigResource[] | undefined)?.find(
    (c) =>
      c.locations?.service_locations?.some((l) => l.service?.rid === svc.id) ||
      c.channels?.some((ch) =>
        ch.members?.some((m) => m.service?.rid === svc.id),
      ),
  );
  if (existing) return toConfig(existing);

  const name = opts.name ?? "Kicklight";
  const base = {
    type: "entertainment_configuration",
    metadata: { name },
    configuration_type: "screen",
    stream_proxy: { mode: "auto" },
    locations: {
      service_locations: [
        {
          service: { rid: svc.id, rtype: "entertainment" },
          positions: stripPositions(segs),
        },
      ],
    },
  };
  const attempts = [
    { ...base, light_services: [{ rid: lightId, rtype: "light" }] },
    base,
  ];
  let lastError = "";
  for (const body of attempts) {
    const r = await clip(api, "POST", "entertainment_configuration", body);
    const rid = (r.json.data as { rid?: string }[] | undefined)?.[0]?.rid;
    if (r.status >= 200 && r.status < 300 && rid) {
      const got = await clip(api, "GET", `entertainment_configuration/${rid}`);
      const cfg = (got.json.data as ConfigResource[] | undefined)?.[0];
      if (cfg) return toConfig(cfg);
      return {
        id: rid,
        name,
        channelIds: Array.from({ length: segs }, (_, i) => i),
        active: false,
      };
    }
    lastError = r.json.errors?.[0]?.description ?? `HTTP ${r.status}`;
  }
  throw new EntertainmentError("create_failed", lastError);
}

/** Bridge starts accepting a DTLS session for this configuration. */
export async function startStreaming(
  api: Api,
  configId: string,
): Promise<void> {
  const r = await clip(api, "PUT", `entertainment_configuration/${configId}`, {
    action: "start",
  });
  if (r.status < 200 || r.status >= 300 || r.json.errors?.length) {
    throw new EntertainmentError(
      "start_failed",
      r.json.errors?.[0]?.description ?? `HTTP ${r.status}`,
    );
  }
}

export async function stopStreaming(api: Api, configId: string): Promise<void> {
  const r = await clip(api, "PUT", `entertainment_configuration/${configId}`, {
    action: "stop",
  });
  if (r.status < 200 || r.status >= 300 || r.json.errors?.length) {
    throw new EntertainmentError(
      "stop_failed",
      r.json.errors?.[0]?.description ?? `HTTP ${r.status}`,
    );
  }
}

/**
 * DTLS PSK identity. For CLIP v2 it is the `hue-application-id` response header of
 * `GET /auth/v1`, which is a different value from the application key (username).
 * Checked on the owner's bridge: the two differ.
 */
export async function fetchApplicationId(api: Api): Promise<string> {
  const res = await api.fetch(`https://${api.ip}/auth/v1`, {
    headers: { "hue-application-key": api.applicationKey },
  });
  const id = res.headers.get("hue-application-id");
  await res.text().catch(() => "");
  if (!id) {
    throw new EntertainmentError(
      "no_application_id",
      `bridge returned no hue-application-id (HTTP ${res.status})`,
    );
  }
  return id;
}

// ---------------------------------------------------------------------------
// DTLS-PSK socket, behind an injectable factory
// ---------------------------------------------------------------------------

export interface DtlsConnectOptions {
  host: string;
  port: number;
  /** PSK identity: `hue-application-id`. */
  identity: string;
  /** Raw PSK bytes (the hex `clientkey` decoded). */
  psk: Uint8Array;
}

export interface DtlsSocket {
  send(data: Uint8Array): void;
  close(): void;
  /** Called once if the session dies (bridge stopped streaming, network gone). */
  onClose(cb: (err?: Error) => void): void;
}

export interface DtlsSocketFactory {
  connect(opts: DtlsConnectOptions): Promise<DtlsSocket>;
}

export const hexToBytes = (hex: string): Uint8Array => {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex))
    throw new RangeError("clientkey is not hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
};

/**
 * Default factory on `node-dtls-client` (pure JS, no native modules). Proven to handshake
 * under Bun 1.4 against an independent DTLS 1.2 PSK server (see dtls.test.ts).
 */
export const nodeDtlsClientFactory: DtlsSocketFactory = {
  async connect(o) {
    const { dtls } = await import("node-dtls-client");
    // The library has no handshake retransmission, so one dropped UDP packet fails the
    // attempt. Retry a couple of times before giving up.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await new Promise<DtlsSocket>((resolve, reject) => {
          const closers: ((err?: Error) => void)[] = [];
          let open = false;
          const socket = dtls
            .createSocket({
              type: "udp4",
              address: o.host,
              port: o.port,
              psk: { [o.identity]: Buffer.from(o.psk) },
              ciphers: ["TLS_PSK_WITH_AES_128_GCM_SHA256"],
              timeout: 2500,
            })
            .on("connected", () => {
              open = true;
              resolve({
                send: (d) => socket.send(Buffer.from(d)),
                close: () => socket.close(),
                onClose: (cb) => closers.push(cb),
              });
            })
            .on("error", (e: Error) => {
              if (!open) reject(e);
              else for (const c of closers) c(e);
            })
            .on("close", () => {
              if (open) for (const c of closers) c();
            });
        });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("DTLS handshake failed");
  },
};

// ---------------------------------------------------------------------------
// Streaming session: 50 Hz pump
// ---------------------------------------------------------------------------

export interface EntertainmentSessionOptions {
  api: Api;
  config: EntertainmentConfig;
  /** DTLS PSK identity (see fetchApplicationId). */
  identity: string;
  /** Hex `clientkey` from pairing. */
  clientKey: string;
  factory?: DtlsSocketFactory;
  /** Entertainment DTLS port, 2100 on every bridge. */
  port?: number;
  rateHz?: number;
  now?: () => number;
  /** Timer injection for tests: call `fn` every `ms` until the returned stop is called. */
  every?: (ms: number, fn: () => void) => () => void;
  onClose?: (err?: Error) => void;
}

/** Source of one colour per renderer channel for the given time. */
export type FrameSource = (now: number) => Rgb[];

export class EntertainmentSession {
  private socket: DtlsSocket | null = null;
  private stopTimer: (() => void) | null = null;
  private source: FrameSource | null = null;
  private seq = 0;
  private running = false;
  /** Frames handed to the socket, for diagnostics. */
  sent = 0;

  constructor(private readonly o: EntertainmentSessionOptions) {}

  get channelCount(): number {
    return this.o.config.channelIds.length;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Tell the bridge to stream, handshake DTLS, and start the pump. */
  async start(source: FrameSource): Promise<void> {
    if (this.running) return;
    this.source = source;
    await startStreaming(this.o.api, this.o.config.id);
    try {
      const factory = this.o.factory ?? nodeDtlsClientFactory;
      this.socket = await factory.connect({
        host: this.o.api.ip,
        port: this.o.port ?? 2100,
        identity: this.o.identity,
        psk: hexToBytes(this.o.clientKey),
      });
    } catch (e) {
      await stopStreaming(this.o.api, this.o.config.id).catch(() => {});
      throw e;
    }
    this.socket.onClose((err) => {
      if (!this.running) return;
      this.halt();
      this.o.onClose?.(err);
    });
    this.running = true;
    const every =
      this.o.every ??
      ((ms, fn) => {
        const h = setInterval(fn, ms);
        return () => clearInterval(h);
      });
    this.stopTimer = every(Math.round(1000 / (this.o.rateHz ?? 50)), () =>
      this.pump(),
    );
    this.pump();
  }

  /** Send one frame now. Public so tests and "send a single frame" callers can drive it. */
  pump(): void {
    if (!this.socket || !this.source) return;
    const ids = this.o.config.channelIds.slice(0, HUESTREAM_MAX_CHANNELS);
    if (ids.length === 0) return;
    const colors = this.source((this.o.now ?? Date.now)());
    const mapped = resampleNearest(colors, ids.length);
    const frame = encodeHueStreamV2(
      this.seq++ & 0xff,
      this.o.config.id,
      ids.map((id, i) => ({ id, rgb: mapped[i] })),
    );
    this.socket.send(frame);
    this.sent++;
  }

  /** Stop pumping, close DTLS, and tell the bridge streaming is over. */
  async stop(): Promise<void> {
    const wasRunning = this.running;
    this.halt();
    if (wasRunning) {
      await stopStreaming(this.o.api, this.o.config.id).catch(() => {});
    }
  }

  private halt(): void {
    this.running = false;
    this.stopTimer?.();
    this.stopTimer = null;
    try {
      this.socket?.close();
    } catch {
      // already gone
    }
    this.socket = null;
  }
}
