import type { NextRequest } from "next/server";
import { EFFECTS, type EffectKey } from "@/engine/effects";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { apiError, json, requireUser } from "@/server/auth";
import { transportFor } from "@/server/hue-link";
import { isRgb } from "@/server/validate";

/**
 * Fire one effect from the demo's event pad. In cloud mode only effects with a native
 * bridge-side signal can run; the rest are reported as skipped, not as errors.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const b = (await request.json().catch(() => null)) as {
    effect?: string;
    side?: unknown;
    home?: unknown;
    away?: unknown;
  } | null;
  const fx = b?.effect ? EFFECTS[b.effect as EffectKey] : undefined;
  if (!fx || !isRgb(b?.home) || !isRgb(b?.away))
    return apiError("bad_effect", 400);
  const side = b?.side === "home" || b?.side === "away" ? b.side : null;

  const signal = fx.signal?.({
    home: b.home,
    away: b.away,
    side,
    winner: null,
  });
  if (!signal) return json({ ok: true, skipped: true });

  const t = await transportFor(createAdminClient(), user.id);
  if (!t?.link.light_id) return apiError("not_linked", 409);
  if (!t.transport.signal) return json({ ok: true, skipped: true });
  try {
    await t.transport.signal(signal);
    return json({ ok: true, skipped: false });
  } catch (e) {
    if (e instanceof HueRemoteError && e.unauthorized)
      return apiError("hue_unauthorized", 401);
    return apiError("hue_unavailable", 502, (e as Error).message);
  }
}
