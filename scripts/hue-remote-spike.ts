// Phase 0 spike: prove the Hue Remote API path end to end, and record what it can do.
//
//   bun scripts/hue-remote-spike.ts url            → prints the authorize URL
//   bun scripts/hue-remote-spike.ts exchange CODE  → trades the code for tokens, links the bridge
//   bun scripts/hue-remote-spike.ts probe          → lists lights and tests gradient/signaling remotely
//
// Tokens are kept in .hue-remote-spike.json (gitignored) and never printed.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const FILE = ".hue-remote-spike.json";
const API = "https://api.meethue.com";
const id = process.env.HUE_CLIENT_ID;
const secret = process.env.HUE_CLIENT_SECRET;
if (!id || !secret) throw new Error("HUE_CLIENT_ID / HUE_CLIENT_SECRET missing (see .env.local)");

type Store = {
  access_token?: string;
  refresh_token?: string;
  obtained_at?: number;
  expires_in?: number;
  username?: string;
  state?: string;
};
const load = (): Store => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
const save = (s: Store) => writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });

const SECRETS = /("(?:access_token|refresh_token|username|clientkey)"\s*:\s*")[^"]+/g;
const show = (label: string, status: number, body: string) =>
  console.log(`${label} → HTTP ${status}\n  ${body.replace(SECRETS, "$1<redacted>").slice(0, 700)}`);

const basic = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

async function call(path: string, init: RequestInit & { token?: string; key?: string } = {}) {
  const { token, key, ...rest } = init;
  const headers: Record<string, string> = { "content-type": "application/json", ...(rest.headers as object) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["hue-application-key"] = key;
  const t0 = performance.now();
  const res = await fetch(`${API}${path}`, { ...rest, headers });
  const text = await res.text();
  return { status: res.status, text, ms: Math.round(performance.now() - t0), headers: res.headers };
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
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
  });
  show("token exchange", r.status, r.text);
  const tok = JSON.parse(r.text);
  if (!tok.access_token) process.exit(1);
  const store = { ...load(), access_token: tok.access_token, refresh_token: tok.refresh_token, expires_in: Number(tok.expires_in), obtained_at: Date.now() };
  save(store);

  // Remote link button (equivalent of pressing the physical button), then register an app key.
  const lb = await call("/route/api/0/config", { method: "PUT", token: store.access_token, body: JSON.stringify({ linkbutton: true }) });
  show("remote linkbutton", lb.status, lb.text);
  const reg = await call("/route/api", { method: "POST", token: store.access_token, body: JSON.stringify({ devicetype: "kicklight#spike" }) });
  show("register app key", reg.status, reg.text);
  try {
    const username = JSON.parse(reg.text)?.[0]?.success?.username;
    if (username) save({ ...store, username });
  } catch {}
} else if (cmd === "probe") {
  const s = load();
  if (!s.access_token || !s.username) throw new Error("run exchange first");
  const lights = await call("/route/clip/v2/resource/light", { token: s.access_token, key: s.username });
  show("list lights (remote CLIP v2)", lights.status, lights.text.slice(0, 300));
  console.log(`  latency ${lights.ms} ms; rate-limit headers:`, Object.fromEntries([...lights.headers].filter(([k]) => /rate|limit|retry/i.test(k))));
} else {
  console.log("usage: url | exchange <code> | probe");
}
