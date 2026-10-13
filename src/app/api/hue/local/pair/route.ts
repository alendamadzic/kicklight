import type { NextRequest } from "next/server";
import type { PairResponse } from "@/lib/api-types";
import { encrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PairingError, pairBridge } from "@/lights/local/pairing";
import { apiError, appMode, json, requireUser } from "@/server/auth";
import { isPrivateLanIpv4 } from "@/server/net";

// The user presses the bridge's link button, then calls this: we poll for up to 30 s.
export const maxDuration = 45;

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (appMode() !== "local")
    return apiError("not_available", 404, "Local pairing needs local mode");

  const body = (await request.json().catch(() => null)) as {
    ip?: unknown;
  } | null;
  const ip = typeof body?.ip === "string" ? body.ip.trim() : "";
  if (!isPrivateLanIpv4(ip))
    return apiError("bad_ip", 400, "Use your bridge's local IP address");

  const fail = (
    error: Extract<PairResponse, { ok: false }>["error"],
    message?: string,
  ) =>
    json(
      { ok: false, error, message } satisfies PairResponse,
      error === "failed" ? 502 : 200,
    );

  try {
    const paired = await pairBridge(ip, {
      name: "kicklight",
      timeoutMs: 30_000,
    });
    const admin = createAdminClient();
    const { error: e1 } = await admin.from("hue_links").upsert({
      user_id: user.id,
      transport: "local",
      bridge_id: paired.bridgeId,
      bridge_ip: paired.ip,
      cert_fingerprint: paired.certFingerprint,
      light_id: null,
      light_name: null,
      entertainment_config_id: null,
      token_expires_at: null,
    });
    if (e1) throw e1;
    const { error: e2 } = await admin.from("hue_secrets").upsert({
      user_id: user.id,
      app_key_enc: encrypt(paired.username),
      client_key_enc: encrypt(paired.clientkey),
      access_token_enc: null,
      refresh_token_enc: null,
    });
    if (e2) throw e2;
    return json({ ok: true, bridgeId: paired.bridgeId } satisfies PairResponse);
  } catch (e) {
    if (e instanceof PairingError) {
      return e.code === "link_button_not_pressed" || e.code === "timeout"
        ? fail("link_button_not_pressed")
        : fail("failed", e.message);
    }
    const msg = (e as Error).message;
    return /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|timed out|ENETUNREACH/i.test(
      msg,
    )
      ? fail("unreachable", msg)
      : fail("failed", msg);
  }
}
