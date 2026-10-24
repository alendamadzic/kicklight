import type { NextRequest } from "next/server";
import type { PairResponse } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { PairingError, pairBridge } from "@/lights/local/pairing";
import { appMode } from "@/server/config";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { saveLocalLink } from "@/server/hue-link";
import { isPrivateLanIpv4 } from "@/server/net";

// One pairing attempt per call. The app polls this every couple of seconds while the user
// walks to the bridge and presses its link button, so a request never sits waiting.
export const maxDuration = 20;

type PairFailure = Extract<PairResponse, { ok: false }>["error"];

const UNREACHABLE =
  /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|timed out|ENETUNREACH/i;

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (appMode() !== "local")
    return apiError("not_available", 404, "Local pairing needs local mode");

  const body = (await readJson(request)) as { ip?: unknown } | null;
  const ip = typeof body?.ip === "string" ? body.ip.trim() : "";
  if (!isPrivateLanIpv4(ip))
    return apiError("bad_request", 400, "Use your bridge's local IP address");

  const fail = (error: PairFailure, message?: string) =>
    json(
      { ok: false, error, message } satisfies PairResponse,
      error === "failed" ? 502 : 200,
    );

  try {
    const paired = await pairBridge(ip, { name: "kicklight", timeoutMs: 0 });
    await saveLocalLink(createAdminClient(), user.id, paired);
    return json({ ok: true, bridgeId: paired.bridgeId } satisfies PairResponse);
  } catch (e) {
    if (e instanceof PairingError) {
      return e.code === "link_button_not_pressed" || e.code === "timeout"
        ? fail("link_button_not_pressed")
        : fail("failed", e.message);
    }
    const msg = (e as Error).message;
    return UNREACHABLE.test(msg)
      ? fail("unreachable", msg)
      : fail("failed", msg);
  }
}
