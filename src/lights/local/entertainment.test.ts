import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import type { FetchLike } from "./agent";
import {
  type DtlsConnectOptions,
  type DtlsSocket,
  type EntertainmentConfig,
  EntertainmentError,
  EntertainmentSession,
  encodeHueStreamV2,
  ensureConfiguration,
  fetchApplicationId,
  hexToBytes,
  startStreaming,
  stopStreaming,
  stripPositions,
} from "./entertainment";

const CONFIG_ID = "12345678-1234-4234-8234-123456789abc";

describe("encodeHueStreamV2", () => {
  test("header and one channel, byte for byte", () => {
    const out = encodeHueStreamV2(7, CONFIG_ID, [
      { id: 3, rgb: [255, 0, 128] },
    ]);
    expect(out.length).toBe(52 + 7);
    const expected = Buffer.concat([
      Buffer.from("HueStream", "ascii"),
      Buffer.from([0x02, 0x00]), // version 2.0
      Buffer.from([0x07]), // sequence
      Buffer.from([0x00, 0x00]), // reserved
      Buffer.from([0x00]), // RGB
      Buffer.from([0x00]), // reserved
      Buffer.from(CONFIG_ID, "ascii"),
      Buffer.from([0x03, 0xff, 0xff, 0x00, 0x00, 0x80, 0x80]),
    ]);
    expect(Buffer.from(out).equals(expected)).toBe(true);
  });

  test("channel values scale 0-255 to the full 16-bit range", () => {
    const out = encodeHueStreamV2(0, CONFIG_ID, [{ id: 0, rgb: [1, 255, 0] }]);
    const v = new DataView(out.buffer);
    expect(v.getUint16(53)).toBe(257);
    expect(v.getUint16(55)).toBe(65535);
    expect(v.getUint16(57)).toBe(0);
  });

  test("clamps out-of-range and fractional input", () => {
    const out = encodeHueStreamV2(0, CONFIG_ID, [
      { id: 0, rgb: [300, -5, 127.6] },
    ]);
    const v = new DataView(out.buffer);
    expect(v.getUint16(53)).toBe(65535);
    expect(v.getUint16(55)).toBe(0);
    expect(v.getUint16(57)).toBe(128 * 257);
  });

  test("sequence wraps to a byte", () => {
    expect(encodeHueStreamV2(257, CONFIG_ID, [])[11]).toBe(1);
  });

  test("twenty channels fit, twenty-one do not, bad ids throw", () => {
    const ch = (n: number) =>
      Array.from({ length: n }, (_, id) => ({ id, rgb: [0, 0, 0] as Rgb }));
    expect(encodeHueStreamV2(0, CONFIG_ID, ch(20)).length).toBe(52 + 140);
    expect(() => encodeHueStreamV2(0, CONFIG_ID, ch(21))).toThrow(RangeError);
    expect(() => encodeHueStreamV2(0, "short", [])).toThrow(RangeError);
    expect(() =>
      encodeHueStreamV2(0, CONFIG_ID, [{ id: 256, rgb: [0, 0, 0] }]),
    ).toThrow(RangeError);
  });

  test("hexToBytes", () => {
    expect([...hexToBytes("00ff10")]).toEqual([0, 255, 16]);
    expect(() => hexToBytes("xyz")).toThrow();
  });
});

// A fake bridge for the CLIP v2 entertainment resources.
const LIGHT = "light-1";
const SERVICE = "ent-svc-1";
const entertainmentList = {
  data: [
    {
      id: "other",
      renderer_reference: { rid: "light-9" },
      segments: { max_segments: 1, segments: [{ start: 0, length: 1 }] },
    },
    {
      id: SERVICE,
      renderer_reference: { rid: LIGHT },
      segments: {
        max_segments: 10,
        segments: [3, 3, 5, 5, 5, 3, 3].map((length, i) => ({
          start: i,
          length,
        })),
      },
    },
  ],
};

interface Rec {
  method: string;
  path: string;
  body: unknown;
}
function bridge(opts: {
  configs?: unknown[];
  rejectFirstPost?: boolean;
  putErrors?: boolean;
  appId?: string | null;
}) {
  const calls: Rec[] = [];
  let posted = false;
  const created = {
    id: CONFIG_ID,
    metadata: { name: "Kicklight" },
    status: "inactive",
    channels: [0, 1, 2, 3, 4, 5, 6].map((channel_id) => ({
      channel_id,
      members: [
        {
          service: { rid: SERVICE, rtype: "entertainment" },
          index: channel_id,
        },
      ],
    })),
    locations: { service_locations: [{ service: { rid: SERVICE } }] },
  };
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    const rec = {
      method,
      path: u.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(rec);
    if (u.pathname === "/auth/v1") {
      return new Response("{}", {
        headers:
          opts.appId === null
            ? {}
            : { "hue-application-id": opts.appId ?? "app-id-uuid" },
      });
    }
    if (u.pathname.endsWith("/resource/entertainment"))
      return Response.json(entertainmentList);
    if (
      u.pathname.endsWith("/resource/entertainment_configuration") &&
      method === "GET"
    )
      return Response.json({
        data: [...(opts.configs ?? []), ...(posted ? [created] : [])],
      });
    if (
      u.pathname.endsWith("/resource/entertainment_configuration") &&
      method === "POST"
    ) {
      if (
        opts.rejectFirstPost &&
        !calls.slice(0, -1).some((c) => c.method === "POST")
      ) {
        return Response.json(
          {
            data: [],
            errors: [{ description: "invalid parameter light_services" }],
          },
          { status: 400 },
        );
      }
      posted = true;
      return Response.json(
        {
          data: [{ rid: CONFIG_ID, rtype: "entertainment_configuration" }],
          errors: [],
        },
        { status: 200 },
      );
    }
    if (
      u.pathname.includes("/entertainment_configuration/") &&
      method === "GET"
    )
      return Response.json({ data: [created] });
    if (method === "PUT") {
      return Response.json(
        opts.putErrors
          ? {
              data: [],
              errors: [{ description: "streaming active by another app" }],
            }
          : { data: [{ rid: CONFIG_ID }], errors: [] },
        { status: opts.putErrors ? 409 : 200 },
      );
    }
    return new Response("?", { status: 404 });
  };
  return { fetch, calls };
}

const api = (b: { fetch: FetchLike }) => ({
  fetch: b.fetch,
  ip: "192.168.1.225",
  applicationKey: "key",
});

describe("ensureConfiguration", () => {
  test("creates a screen configuration with one position per segment", async () => {
    const b = bridge({});
    const cfg = await ensureConfiguration(api(b), LIGHT);
    expect(cfg.id).toBe(CONFIG_ID);
    expect(cfg.channelIds).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const post = b.calls.find((c) => c.method === "POST");
    expect(post?.path).toBe("/clip/v2/resource/entertainment_configuration");
    const body = post?.body as {
      configuration_type: string;
      locations: {
        service_locations: {
          service: { rid: string; rtype: string };
          positions: unknown[];
        }[];
      };
      stream_proxy: { mode: string };
    };
    expect(body.configuration_type).toBe("screen");
    expect(body.stream_proxy.mode).toBe("auto");
    expect(body.locations.service_locations[0].service).toEqual({
      rid: SERVICE,
      rtype: "entertainment",
    });
    expect(body.locations.service_locations[0].positions).toHaveLength(7);
  });

  test("reuses a configuration that already contains the strip", async () => {
    const existing = {
      id: "existing-id",
      metadata: { name: "Living room" },
      status: "inactive",
      channels: [{ channel_id: 0, members: [{ service: { rid: SERVICE } }] }],
      locations: { service_locations: [{ service: { rid: SERVICE } }] },
    };
    const b = bridge({ configs: [existing] });
    const cfg = await ensureConfiguration(api(b), LIGHT);
    expect(cfg).toEqual({
      id: "existing-id",
      name: "Living room",
      channelIds: [0],
      active: false,
    });
    expect(b.calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("ignores configurations of other lights", async () => {
    const other = {
      id: "someone-elses",
      locations: { service_locations: [{ service: { rid: "other" } }] },
    };
    const b = bridge({ configs: [other] });
    expect((await ensureConfiguration(api(b), LIGHT)).id).toBe(CONFIG_ID);
  });

  test("retries with a minimal body if the first create is rejected", async () => {
    const b = bridge({ rejectFirstPost: true });
    const cfg = await ensureConfiguration(api(b), LIGHT);
    expect(cfg.id).toBe(CONFIG_ID);
    const posts = b.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(
      (posts[0].body as { light_services?: unknown }).light_services,
    ).toBeDefined();
    expect(
      (posts[1].body as { light_services?: unknown }).light_services,
    ).toBeUndefined();
  });

  test("a light with no entertainment service is an error", async () => {
    const b = bridge({});
    const err = await ensureConfiguration(api(b), "not-a-light").catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(EntertainmentError);
    expect(err.code).toBe("no_entertainment_service");
  });

  test("positions run left to right across the top", () => {
    const p = stripPositions(7);
    expect(p[0].x).toBeCloseTo(-0.9);
    expect(p[6].x).toBeCloseTo(0.9);
    expect(p.every((q) => q.z === 0.9)).toBe(true);
  });
});

describe("start / stop / application id", () => {
  test("PUT action start and stop", async () => {
    const b = bridge({});
    await startStreaming(api(b), CONFIG_ID);
    await stopStreaming(api(b), CONFIG_ID);
    expect(b.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      [
        "PUT",
        `/clip/v2/resource/entertainment_configuration/${CONFIG_ID}`,
        { action: "start" },
      ],
      [
        "PUT",
        `/clip/v2/resource/entertainment_configuration/${CONFIG_ID}`,
        { action: "stop" },
      ],
    ]);
  });

  test("start surfaces the bridge's refusal", async () => {
    const b = bridge({ putErrors: true });
    const err = await startStreaming(api(b), CONFIG_ID).catch((e) => e);
    expect(err.code).toBe("start_failed");
    expect(err.message).toContain("another app");
  });

  test("application id comes from the auth/v1 header", async () => {
    expect(await fetchApplicationId(api(bridge({ appId: "abc-uuid" })))).toBe(
      "abc-uuid",
    );
    const err = await fetchApplicationId(api(bridge({ appId: null }))).catch(
      (e) => e,
    );
    expect(err.code).toBe("no_application_id");
  });
});

describe("EntertainmentSession", () => {
  const config: EntertainmentConfig = {
    id: CONFIG_ID,
    name: "k",
    channelIds: [0, 1, 2, 3, 4, 5, 6],
    active: false,
  };

  function harness(over: { failConnect?: boolean } = {}) {
    const b = bridge({});
    const sent: Uint8Array[] = [];
    const connects: DtlsConnectOptions[] = [];
    let closeCb: ((e?: Error) => void) | null = null;
    let closed = false;
    const ticks: (() => void)[] = [];
    let stopped = false;
    let t = 1000;
    const closes: (Error | undefined)[] = [];
    const s = new EntertainmentSession({
      api: api(b),
      config,
      identity: "app-id",
      clientKey: "00112233445566778899aabbccddeeff",
      now: () => t,
      every: (_ms, fn) => {
        ticks.push(fn);
        return () => {
          stopped = true;
        };
      },
      onClose: (e) => closes.push(e),
      factory: {
        async connect(o) {
          connects.push(o);
          if (over.failConnect) throw new Error("handshake timeout");
          const sock: DtlsSocket = {
            send: (d) => sent.push(d),
            close: () => {
              closed = true;
            },
            onClose: (cb) => {
              closeCb = cb;
            },
          };
          return sock;
        },
      },
    });
    return {
      b,
      s,
      sent,
      connects,
      closes,
      tick: () => ticks[0]?.(),
      drop: () => closeCb?.(new Error("reset")),
      setNow: (n: number) => {
        t = n;
      },
      get closed() {
        return closed;
      },
      get timerStopped() {
        return stopped;
      },
    };
  }

  test("starts streaming, connects with identity and PSK, sends 7-channel frames", async () => {
    const h = harness();
    const colors: Rgb[] = [
      [255, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
    ];
    await h.s.start(() => colors);
    expect(h.b.calls[0].body).toEqual({ action: "start" });
    expect(h.connects[0]).toMatchObject({
      host: "192.168.1.225",
      port: 2100,
      identity: "app-id",
    });
    expect(Buffer.from(h.connects[0].psk).toString("hex")).toBe(
      "00112233445566778899aabbccddeeff",
    );
    expect(h.sent).toHaveLength(1);
    h.tick();
    h.tick();
    expect(h.sent).toHaveLength(3);
    const f = h.sent[2];
    expect(f.length).toBe(52 + 7 * 7);
    expect(f[11]).toBe(2); // sequence advances
    expect(Buffer.from(f.slice(16, 52)).toString()).toBe(CONFIG_ID);
    expect(f[52]).toBe(0);
    expect(f[53]).toBe(0xff);
    expect(f[52 + 6 * 7]).toBe(6);
    expect(f[52 + 6 * 7 + 5]).toBe(0xff); // last channel blue
  });

  test("resamples a different channel count onto the configured channels", async () => {
    const h = harness();
    await h.s.start(() => [
      [255, 0, 0],
      [0, 255, 0],
    ]);
    const f = h.sent[0];
    expect(f[53]).toBe(0xff); // ch 0 red (3 of 7 take the first colour)
    expect(f[52 + 6 * 7 + 3]).toBe(0xff); // ch 6 green
  });

  test("stop closes the socket, stops the timer and tells the bridge", async () => {
    const h = harness();
    await h.s.start(() => [[0, 0, 0]]);
    await h.s.stop();
    expect(h.closed).toBe(true);
    expect(h.timerStopped).toBe(true);
    expect(h.b.calls.at(-1)?.body).toEqual({ action: "stop" });
    expect(h.s.isRunning).toBe(false);
  });

  test("a failed handshake rolls streaming back", async () => {
    const h = harness({ failConnect: true });
    await expect(h.s.start(() => [[0, 0, 0]])).rejects.toThrow(/handshake/);
    expect(
      h.b.calls.map((c) => (c.body as { action?: string } | null)?.action),
    ).toEqual(["start", "stop"]);
  });

  test("a dropped session is reported once", async () => {
    const h = harness();
    await h.s.start(() => [[0, 0, 0]]);
    h.drop();
    h.drop();
    expect(h.closes).toHaveLength(1);
    expect(h.s.isRunning).toBe(false);
  });
});
