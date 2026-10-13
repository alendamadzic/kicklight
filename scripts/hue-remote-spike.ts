// Phase 0 spike: prove the Hue Remote API path end to end, and record what it can do.
//
//   bun scripts/hue-remote-spike.ts url            → prints the authorize URL
//   bun scripts/hue-remote-spike.ts exchange CODE  → trades the code for tokens, links the bridge
//   bun scripts/hue-remote-spike.ts probe          → lists lights and tests gradient/signaling remotely
//
// Tokens are kept in .hue-remote-spike.json (gitignored) and never printed.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".hue-remote-spike.json";
const API = "https://api.meethue.com";
const id = process.env.HUE_CLIENT_ID;
const secret = process.env.HUE_CLIENT_SECRET;
if (!id || !secret)
  throw new Error("HUE_CLIENT_ID / HUE_CLIENT_SECRET missing (see .env.local)");

type Store = {
  access_token?: string;
  refresh_token?: string;
  obtained_at?: number;
  expires_in?: number;
  username?: string;
  state?: string;
};
const load = (): Store =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const save = (s: Store) =>
  writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });

const SECRETS =
  /("(?:access_token|refresh_token|username|clientkey)"\s*:\s*")[^"]+/g;
const show = (label: string, status: number, body: string) =>
  console.log(
    `${label} → HTTP ${status}\n  ${body.replace(SECRETS, "$1<redacted>").slice(0, 700)}`,
  );

const basic = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

async function call(
  path: string,
  init: RequestInit & { token?: string; key?: string } = {},
) {
  const { token, key, ...rest } = init;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as object),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["hue-application-key"] = key;
  const t0 = performance.now();
  const res = await fetch(`${API}${path}`, { ...rest, headers });
  const text = await res.text();
  return {
    status: res.status,
    text,
    ms: Math.round(performance.now() - t0),
    headers: res.headers,
  };
}

const cmd = process.argv[2];

if (cmd === "url") {
  const state = randomBytes(12).toString("hex");
  save({ ...load(), state });
  const u = new URL(`${API}/v2/oauth2/authorize`);
  u.searchParams.set("client_id", id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  console.log(u.toString());
} else if (cmd === "exchange") {
  const code = process.argv[3];
  if (!code) throw new Error("usage: exchange <code>");
  const r = await call("/v2/oauth2/token", {
    method: "POST",
    headers: {
      authorization: basic,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/hue/oauth/callback`,
    }).toString(),
  });
  show("token exchange", r.status, r.text);
  const tok = JSON.parse(r.text);
  if (!tok.access_token) process.exit(1);
  const store = {
    ...load(),
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_in: Number(tok.expires_in),
    obtained_at: Date.now(),
  };
  save(store);

  // Remote link button (equivalent of pressing the physical button), then register an app key.
  const lb = await call("/route/api/0/config", {
    method: "PUT",
    token: store.access_token,
    body: JSON.stringify({ linkbutton: true }),
  });
  show("remote linkbutton", lb.status, lb.text);
  const reg = await call("/route/api", {
    method: "POST",
    token: store.access_token,
    body: JSON.stringify({ devicetype: "kicklight#spike" }),
  });
  show("register app key", reg.status, reg.text);
  try {
    const username = JSON.parse(reg.text)?.[0]?.success?.username;
    if (username) save({ ...store, username });
  } catch {}
} else if (cmd === "probe") {
  const s = load();
  if (!s.access_token || !s.username) throw new Error("run exchange first");
  const lights = await call("/route/clip/v2/resource/light", {
    token: s.access_token,
    key: s.username,
  });
  show(
    "list lights (remote CLIP v2)",
    lights.status,
    lights.text.slice(0, 300),
  );
  console.log(
    `  latency ${lights.ms} ms; rate-limit headers:`,
    Object.fromEntries(
      [...lights.headers].filter(([k]) => /rate|limit|retry/i.test(k)),
    ),
  );
} else if (cmd === "write-test") {
  const s = load();
  if (!s.access_token || !s.username) throw new Error("run exchange first");
  const lightId = JSON.parse(readFileSync("kicklight.config.json", "utf8"))
    .lightId as string;
  const path = `/route/clip/v2/resource/light/${lightId}`;
  const opt = { token: s.access_token, key: s.username };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const { rgbToXy } = await import("../src/lights/xy");
  const home = rgbToXy([108, 171, 221]);
  const away = rgbToXy([200, 16, 46]);
  const pts = (n: number) =>
    [...Array(5)].map((_, i) => ({ color: { xy: i < n ? home : away } }));

  const before = await call(path, opt);
  show("GET light", before.status, before.text.slice(0, 120));
  console.log(`  latency ${before.ms} ms`);
  const orig = JSON.parse(before.text).data[0];
  const restore = {
    on: { on: orig.on.on },
    dimming: { brightness: orig.dimming.brightness },
    gradient: { points: orig.gradient.points, mode: orig.gradient.mode },
  };

  try {
    const seg = await call(path, {
      ...opt,
      method: "PUT",
      body: JSON.stringify({
        on: { on: true },
        dimming: { brightness: 100 },
        gradient: { mode: "segmented_palette", points: pts(3) },
        dynamics: { duration: 1000 },
      }),
    });
    show("PUT segmented_palette 3/2", seg.status, seg.text);
    console.log(`  latency ${seg.ms} ms`);
    await sleep(2000);
    const chk = JSON.parse((await call(path, opt)).text).data[0];
    console.log(
      `  readback: mode=${chk.gradient?.mode} points=${chk.gradient?.points?.length}`,
    );

    const sig = await call(path, {
      ...opt,
      method: "PUT",
      body: JSON.stringify({
        signaling: {
          signal: "alternating",
          duration: 3000,
          colors: [{ xy: home }, { xy: { x: 0.3227, y: 0.329 } }],
        },
      }),
    });
    show("PUT signaling alternating 3s", sig.status, sig.text);
    console.log(`  latency ${sig.ms} ms`);
    await sleep(3600);

    // Burst: how hard can we push the remote path before it pushes back?
    const results: string[] = [];
    const t0 = performance.now();
    for (let i = 0; i < 12; i++) {
      const r = await call(path, {
        ...opt,
        method: "PUT",
        body: JSON.stringify({
          gradient: { mode: "segmented_palette", points: pts(1 + (i % 4)) },
        }),
      });
      results.push(`${r.status}/${r.ms}ms`);
      if (r.status === 429) {
        console.log(
          "  rate-limit headers:",
          Object.fromEntries(
            [...r.headers].filter(([k]) => /rate|limit|retry/i.test(k)),
          ),
        );
        break;
      }
    }
    console.log(
      `  burst of 12 sequential PUTs in ${Math.round(performance.now() - t0)} ms:`,
      results.join(" "),
    );
  } finally {
    const r = await call(path, {
      ...opt,
      method: "PUT",
      body: JSON.stringify({ ...restore, dynamics: { duration: 500 } }),
    });
    show("restore original state", r.status, r.text);
  }
} else {
  console.log("usage: url | exchange <code> | probe | write-test");
}
