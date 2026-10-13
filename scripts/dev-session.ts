// Make a signed-in throwaway user for exercising the UI against the real Supabase project:
//   bun --conditions react-server scripts/dev-session.ts [--link-hue] [--origin http://localhost:3000]
//   bun --conditions react-server scripts/dev-session.ts --cleanup <user id>
// Prints a one-time sign-in URL for the local app. --link-hue copies the tokens from
// .hue-remote-spike.json onto the user (so the real strip is driven) and picks the light
// from LIGHT_ID or kicklight.config.json. Remember to --cleanup afterwards.

import { existsSync, readFileSync } from "node:fs";
import { encrypt } from "../src/lib/crypto";
import { createAdminClient } from "../src/lib/supabase/admin";

const args = process.argv.slice(2);
const admin = createAdminClient();

const cleanupIdx = args.indexOf("--cleanup");
if (cleanupIdx >= 0) {
  const id = args[cleanupIdx + 1];
  if (!id) throw new Error("usage: --cleanup <user id>");
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
  console.log("deleted", id);
  process.exit(0);
}

const origin = args[args.indexOf("--origin") + 1] ?? "http://localhost:3000";
const email = `dev+${Date.now()}@kicklight.test`;
const created = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (created.error || !created.data.user)
  throw created.error ?? new Error("no user");
const userId = created.data.user.id;

if (args.includes("--link-hue")) {
  if (!existsSync(".hue-remote-spike.json"))
    throw new Error("run scripts/hue-remote-spike.ts first");
  const spike = JSON.parse(readFileSync(".hue-remote-spike.json", "utf8"));
  const lightId =
    process.env.LIGHT_ID ??
    JSON.parse(readFileSync("kicklight.config.json", "utf8")).lightId;
  const l = await admin.from("hue_links").insert({
    user_id: userId,
    transport: "remote",
    light_id: lightId,
    light_name: "TV Backlight",
    token_expires_at: new Date(
      spike.obtained_at + spike.expires_in * 1000,
    ).toISOString(),
  });
  if (l.error) throw l.error;
  const s = await admin.from("hue_secrets").insert({
    user_id: userId,
    app_key_enc: encrypt(spike.username),
    access_token_enc: encrypt(spike.access_token),
    refresh_token_enc: encrypt(spike.refresh_token),
  });
  if (s.error) throw s.error;
}

const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (link.error) throw link.error;
const hash = link.data.properties.hashed_token;
console.log(`user ${userId}`);
console.log(`${origin}/auth/callback?token_hash=${hash}&type=magiclink&next=/`);
