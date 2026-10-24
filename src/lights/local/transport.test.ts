import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import { brightnessFor } from "../gradient";
import { CommandQueue } from "../queue";
import { rgbToXy } from "../xy";
import type { FetchLike } from "./agent";
import { LocalTransport, listGradientLights } from "./transport";

const H: Rgb = [108, 171, 221];
const A: Rgb = [200, 16, 46];
const KEY = "app-key";

const stripLight = {
  id: "light-1",
  metadata: { name: "TV Backlight" },
  on: { on: true },
  dimming: { brightness: 61 },
  color: { xy: { x: 0.3, y: 0.32 }, gamut_type: "C" },
  color_temperature: { mirek: null, mirek_valid: false },
  gradient: {
    points: [{ color: { xy: { x: 0.3, y: 0.33 } } }],
    mode: "interpolated_palette",
    points_capable: 5,
    pixel_count: 27,
    mode_values: ["segmented_palette"],
  },
  effects_v2: { status: { effect: "no_effect" } },
};

interface Call {
  method: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: test fixture, shape asserted per test
  body: any;
  key: string | null;
}

function fakeBridge(respond?: (call: Call, n: number) => Response | undefined) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: Call = {
      method: init?.method ?? "GET",
      path: new URL(String(url)).pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      key: new Headers(init?.headers).get("hue-application-key"),
    };
    calls.push(call);
    const custom = respond?.(call, calls.length);
    if (custom) return custom;
    if (call.method === "GET" && call.path.endsWith("/light"))
      return Response.json({
        data: [stripLight, { id: "bulb", on: { on: true } }],
      });
    if (call.method === "GET") return Response.json({ data: [stripLight] });
    return Response.json({
      data: [{ rid: "light-1", rtype: "light" }],
      errors: [],
    });
  };
  return { fetch, calls };
}

const make = (b: ReturnType<typeof fakeBridge>, extra = {}) => {
  const sleeps: number[] = [];
  const t = new LocalTransport({
    fetch: b.fetch,
    ip: "192.168.1.225",
    applicationKey: KEY,
    lightId: "light-1",
    points: 5,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    queue: new CommandQueue({ minIntervalMs: 0, sleep: async () => {} }),
    ...extra,
  });
  return { t, sleeps };
};

describe("LocalTransport", () => {
  test("setGradient sends a segmented_palette with points_capable points", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    await t.setGradient([H, H, H, A, A], 900);
    expect(b.calls).toHaveLength(1);
    const c = b.calls[0];
    expect(c.method).toBe("PUT");
    expect(c.path).toBe("/clip/v2/resource/light/light-1");
    expect(c.key).toBe(KEY);
    expect(c.body.on).toEqual({ on: true });
    expect(c.body.dynamics).toEqual({ duration: 900 });
    expect(c.body.dimming.brightness).toBe(brightnessFor([H, A]));
    expect(c.body.gradient.mode).toBe("segmented_palette");
    expect(c.body.gradient.points).toHaveLength(5);
    expect(c.body.gradient.points[0].color.xy).toEqual(rgbToXy(H));
    expect(c.body.gradient.points[4].color.xy).toEqual(rgbToXy(A));
  });

  test("resamples a 10-channel render down to the strip's 5 points", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    const ten = [...Array(6).fill(H), ...Array(4).fill(A)] as Rgb[];
    await t.setGradient(ten);
    const pts = b.calls[0].body.gradient.points;
    expect(pts).toHaveLength(5);
    expect(pts[2].color.xy).toEqual(rgbToXy(H));
    expect(pts[3].color.xy).toEqual(rgbToXy(A));
  });

  test("resting states coalesce under one key; the newest wins", async () => {
    const b = fakeBridge();
    // A real gap so the first send blocks the rest in the queue.
    const q = new CommandQueue({ minIntervalMs: 0 });
    const { t } = make(b, { queue: q });
    const p1 = t.setGradient([H, H, H, H, H]);
    const p2 = t.setGradient([A, A, A, A, A]);
    const p3 = t.setGradient([H, H, A, A, A]);
    await Promise.all([p1, p2, p3]);
    const last = b.calls.at(-1);
    expect(last?.body.gradient.points[0].color.xy).toEqual(rgbToXy(H));
    expect(last?.body.gradient.points[4].color.xy).toEqual(rgbToXy(A));
    expect(b.calls.length).toBeLessThan(3);
  });

  test("a restore that replaces a queued gradient still settles its caller", async () => {
    const b = fakeBridge();
    const { t } = make(b, { queue: new CommandQueue({ minIntervalMs: 0 }) });
    const sent = t.setGradient([H, H, H, H, H]);
    const replaced = t.setGradient([A, A, A, A, A]);
    // Restore while the second gradient is still waiting behind the first.
    const restored = t.restore({
      on: true,
      brightness: 61,
      gradient: null,
      xy: null,
      mirek: null,
      effect: null,
    });
    const settled = await Promise.race([
      Promise.all([sent, replaced, restored]).then(() => true),
      new Promise((r) => setTimeout(() => r(false), 500)),
    ]);
    expect(settled).toBe(true);
    // The replaced gradient was never sent: the restore went out instead.
    expect(b.calls.at(-1)?.body.dimming).toEqual({ brightness: 61 });
  });

  test("signal uses signaling with xy colours and whole-second durations", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    await t.signal({
      signal: "alternating",
      durationMs: 5000,
      colors: [H, [255, 244, 230]],
    });
    await t.signal({ signal: "on_off_color", durationMs: 1400, colors: [A] });
    expect(b.calls[0].body).toEqual({
      signaling: {
        signal: "alternating",
        duration: 5000,
        colors: [{ xy: rgbToXy(H) }, { xy: rgbToXy([255, 244, 230]) }],
      },
    });
    expect(b.calls[1].body.signaling.duration).toBe(1000);
  });

  test("snapshot and restore round-trip on/dimming/gradient", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    const snap = await t.snapshot();
    expect(snap).toMatchObject({ on: true, brightness: 61, effect: null });
    await t.restore(snap);
    const put = b.calls.at(-1);
    expect(put?.method).toBe("PUT");
    expect(put?.body.on).toEqual({ on: true });
    expect(put?.body.dimming).toEqual({ brightness: 61 });
    expect(put?.body.gradient).toEqual({
      mode: "interpolated_palette",
      points: stripLight.gradient.points,
    });
  });

  test("restore falls back to colour when the strip showed no gradient", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    await t.restore({
      on: false,
      brightness: 20,
      gradient: null,
      xy: { x: 0.4, y: 0.4 },
      mirek: null,
      effect: null,
    });
    expect(b.calls[0].body.color).toEqual({ xy: { x: 0.4, y: 0.4 } });
    expect(b.calls[0].body.on).toEqual({ on: false });
  });

  test("backs off on 429 and 503, then succeeds", async () => {
    let n = 0;
    const b = fakeBridge((c) => {
      if (c.method === "PUT" && ++n <= 2)
        return new Response("busy", {
          status: n === 1 ? 429 : 503,
          headers: n === 2 ? { "retry-after": "3" } : {},
        });
    });
    const { t, sleeps } = make(b);
    await t.setGradient([H, H, H, A, A]);
    expect(b.calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 3000]);
  });

  test("gives up after maxRetries and rejects", async () => {
    const b = fakeBridge(() => new Response("busy", { status: 429 }));
    const { t } = make(b, { maxRetries: 2 });
    await expect(t.setGradient([H, A])).rejects.toThrow(/busy/);
    expect(b.calls).toHaveLength(3);
  });

  test("connect learns points and gamut from the light", async () => {
    const b = fakeBridge();
    const t = await LocalTransport.connect({
      fetch: b.fetch,
      ip: "192.168.1.225",
      applicationKey: KEY,
      lightId: "light-1",
    });
    expect(t.points).toBe(5);
    expect(t.kind).toBe("local");
  });

  test("connect rejects a light with no gradient", async () => {
    const f: FetchLike = async () =>
      Response.json({ data: [{ id: "bulb", on: { on: true } }] });
    await expect(
      LocalTransport.connect({
        fetch: f,
        ip: "x",
        applicationKey: KEY,
        lightId: "bulb",
      }),
    ).rejects.toThrow(/gradient/);
  });
});

describe("listGradientLights", () => {
  test("returns only gradient-capable lights", async () => {
    const b = fakeBridge();
    const r = await listGradientLights(b.fetch, "192.168.1.225", KEY);
    expect(r).toEqual([
      {
        id: "light-1",
        name: "TV Backlight",
        pointsCapable: 5,
        pixelCount: 27,
        modes: ["segmented_palette"],
        gamutType: "C",
      },
    ]);
  });
});

describe("LocalTransport strip direction and identify", () => {
  test("a reversed strip gets the gradient flipped, home still on the left of the TV", async () => {
    const b = fakeBridge();
    const { t } = make(b, { reversed: true });
    await t.setGradient([H, H, H, A, A]);
    const pts = b.calls[0].body.gradient.points;
    expect(pts[0].color.xy).toEqual(rgbToXy(A));
    expect(pts[4].color.xy).toEqual(rgbToXy(H));
  });
  test("setReversed takes effect on the next gradient", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    t.setReversed(true);
    await t.setGradient([H, A, A, A, A]);
    expect(b.calls[0].body.gradient.points[4].color.xy).toEqual(rgbToXy(H));
  });
  test("identify blinks any light by id", async () => {
    const b = fakeBridge();
    const { t } = make(b);
    await t.identify("other-light");
    expect(b.calls[0].method).toBe("PUT");
    expect(b.calls[0].path).toBe("/clip/v2/resource/light/other-light");
    expect(b.calls[0].body).toEqual({ identify: { action: "identify" } });
  });
});
