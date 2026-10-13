// End-to-end check of the cloud path against the real Supabase project and the real strip:
//   bun --conditions react-server scripts/e2e-cloud.ts            (Derby day replay, ~2 min)
//   LEAGUE=uefa.champions EVENT_ID=401915418 TICKS=24 bun --conditions react-server scripts/e2e-cloud.ts  (a live match)
// Creates a throwaway user + replay session, drives /api/cron/tick every 10 s until the
// session ends, then deletes everything it created. Needs .hue-remote-spike.json
// (from scripts/hue-remote-spike.ts) and kicklight.config.json for the light id.

import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET as tick } from "../src/app/api/cron/tick/route";
import { encrypt } from "../src/lib/crypto";
import { createAdminClient } from "../src/lib/supabase/admin";

const spike = JSON.parse(readFileSync(".hue-remote-spike.json", "utf8")) as {
  access_token: string;
  refresh_token: string;
  username: string;
  obtained_at: number;
  expires_in: number;
};
const lightId = JSON.parse(readFileSync("kicklight.config.json", "utf8"))
  .lightId as string;
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET missing");

const admin = createAdminClient();
const email = `e2e+${Date.now()}@kicklight.test`;
let userId: string | null = null;

try {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw created.error ?? new Error("no user");
  userId = created.data.user.id;
  console.log("created throwaway user");

  const must = async (
    p: PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const { error } = await p;
    if (error) throw new Error(error.message);
  };
  await must(
    admin.from("hue_links").insert({
      user_id: userId,
      transport: "remote",
      light_id: lightId,
      light_name: "TV Backlight",
      token_expires_at: new Date(
        spike.obtained_at + spike.expires_in * 1000,
      ).toISOString(),
    }),
  );
  await must(
    admin.from("hue_secrets").insert({
      user_id: userId,
      app_key_enc: encrypt(spike.username),
      access_token_enc: encrypt(spike.access_token),
      refresh_token_enc: encrypt(spike.refresh_token),
    }),
  );
  await must(
    admin.from("sessions").insert({
      user_id: userId,
      league: process.env.LEAGUE ?? "replay",
      event_id: process.env.EVENT_ID ?? "derby-day",
      stat: "auto",
      mode: "remote",
      delay_ms: 0,
    }),
  );
  console.log("session started: Derby day replay (about 95 s + 30 s hold)\n");

  const t0 = Date.now();
  for (let i = 0; i < Number(process.env.TICKS ?? 20); i++) {
    const res = await tick(
      new NextRequest("http://localhost/api/cron/tick", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    const body = await res.json();
    const { data } = await admin
      .from("sessions")
      .select("status, snapshot, next_due_at")
      .eq("user_id", userId)
      .single();
    const m = data?.snapshot as {
      match?: {
        score: { home: number; away: number };
        minute: number | null;
        phase: string;
      };
      activeStat?: string;
      recent?: unknown[];
    } | null;
    console.log(
      `t+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  http=${res.status} ${JSON.stringify(body)}  status=${data?.status}  ` +
        `${m?.match ? `${m.match.score.home}-${m.match.score.away} min=${Math.round(m.match.minute ?? 0)} ${m.match.phase} stat=${m.activeStat} recent=${m.recent?.length}` : "(no snapshot yet)"}`,
    );
    if (data?.status === "ended") {
      console.log("\nsession ended and the strip was restored");
      break;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId); // cascades hue_links, hue_secrets, sessions
    console.log("cleaned up throwaway user");
  }
}
