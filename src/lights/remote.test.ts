import { describe, expect, test } from "bun:test";
import {
  authorizeUrl,
  exchangeCode,
  HueRemoteError,
  linkBridge,
  RemoteTransport,
  resample,
} from "./remote";

type Call = { url: string; init: RequestInit };
const fake = (responder: (c: Call) => { status?: number; body: unknown }) => {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const c = { url: String(url), init };
    calls.push(c);
    const r = responder(c);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
};

describe("oauth", () => {
  test("authorize url", () => {
    const u = new URL(authorizeUrl("cid", "st"));
    expect(u.origin + u.pathname).toBe(
      "https://api.meethue.com/v2/oauth2/authorize",
    );
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("state")).toBe("st");
  });

  test("code exchange uses basic auth and echoes redirect_uri", async () => {
    const { f, calls } = fake(() => ({
      body: { access_token: "A", refresh_token: "R", expires_in: "604790" },
    }));
    const t = await exchangeCode(
      "code1",
      "https://x.test/cb",
      { clientId: "id", clientSecret: "s" },
      f,
      1_000,
    );
    expect(t).toEqual({
      accessToken: "A",
      refreshToken: "R",
      expiresAt: 1_000 + 604_790_000,
    });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.authorization).toBe(
      `Basic ${Buffer.from("id:s").toString("base64")}`,
    );
    expect(String(calls[0].init.body)).toContain(
      "redirect_uri=https%3A%2F%2Fx.test%2Fcb",
    );
  });

  test("invalid_grant surfaces as an error with the status", async () => {
    const { f } = fake(() => ({
      status: 400,
      body: { error: "invalid_grant" },
    }));
    const err = await exchangeCode(
      "bad",
      "u",
      { clientId: "i", clientSecret: "s" },
      f,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(HueRemoteError);
    expect(err.status).toBe(400);
  });

  test("linking presses the remote button then registers a key", async () => {
    const { f, calls } = fake((c) =>
      c.url.endsWith("/route/api")
        ? { body: [{ success: { username: "KEY" } }] }
        : { body: [{ success: { "/config/linkbutton": true } }] },
    );
    expect(await linkBridge("tok", "kicklight", f)).toEqual({ appKey: "KEY" });
    expect(calls.map((c) => c.init.method)).toEqual(["PUT", "POST"]);
  });
});

describe("RemoteTransport", () => {
  const cfg = { accessToken: "T", appKey: "K", lightId: "L" };
  const colors = [
    [255, 0, 0],
    [255, 0, 0],
    [0, 0, 255],
  ] as [number, number, number][];

  test("resample keeps blocks crisp", () => {
    expect(resample(["a", "b"], 5)).toEqual(
      ["a", "a", "b", "b", "b"].slice(0, 5).map((_, i) => (i < 2 ? "a" : "b")),
    );
    expect(resample([1, 2, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test("setGradient sends segmented_palette with 5 points, a transition and auth headers", async () => {
    const { f, calls } = fake(() => ({ body: { data: [], errors: [] } }));
    await new RemoteTransport({ ...cfg, fetchImpl: f }).setGradient(
      colors,
      1500,
    );
    const c = calls[0];
    expect(c.url).toBe(
      "https://api.meethue.com/route/clip/v2/resource/light/L",
    );
    expect(c.init.method).toBe("PUT");
    const h = c.init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer T");
    expect(h["hue-application-key"]).toBe("K");
    const body = JSON.parse(String(c.init.body));
    expect(body.gradient.mode).toBe("segmented_palette");
    expect(body.gradient.points).toHaveLength(5);
    expect(body.dynamics.duration).toBe(1500);
    expect(body.on.on).toBe(true);
  });

  test("setGradient dims with the colours, so a uniform dim isn't lost to xy", async () => {
    const { f, calls } = fake(() => ({ body: { data: [], errors: [] } }));
    const t = new RemoteTransport({ ...cfg, fetchImpl: f });
    await t.setGradient([[255, 0, 0]]);
    await t.setGradient([[128, 0, 0]]);
    const [full, half] = calls.map((c) => JSON.parse(String(c.init.body)));
    expect(full.dimming.brightness).toBe(100);
    expect(half.dimming.brightness).toBe(50);
  });

  test("signal sends at most two colours", async () => {
    const { f, calls } = fake(() => ({ body: {} }));
    await new RemoteTransport({ ...cfg, fetchImpl: f }).signal({
      signal: "alternating",
      durationMs: 5000,
      colors: [
        [255, 0, 0],
        [255, 255, 255],
        [0, 0, 255],
      ],
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.signaling.signal).toBe("alternating");
    expect(body.signaling.duration).toBe(5000);
    expect(body.signaling.colors).toHaveLength(2);
  });

  test("snapshot then restore puts the light back, and learns the point count", async () => {
    const light = {
      id: "L",
      metadata: { name: "TV", archetype: "hue_lightstrip" },
      on: { on: true },
      dimming: { brightness: 62 },
      gradient: {
        mode: "interpolated_palette",
        points_capable: 5,
        points: [{ color: { xy: { x: 0.3, y: 0.3 } } }],
      },
    };
    const { f, calls } = fake((c) => ({
      body: c.init.method === "PUT" ? {} : { data: [light] },
    }));
    const t = new RemoteTransport({ ...cfg, points: 3, fetchImpl: f });
    const snap = await t.snapshot();
    expect(t.points).toBe(5);
    await t.restore(snap);
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.dimming.brightness).toBe(62);
    expect(body.gradient.mode).toBe("interpolated_palette");
  });

  test("401 is flagged as unauthorized", async () => {
    const { f } = fake(() => ({ status: 401, body: {} }));
    const err = await new RemoteTransport({ ...cfg, fetchImpl: f })
      .setGradient(colors)
      .catch((e) => e);
    expect(err.unauthorized).toBe(true);
  });
});
