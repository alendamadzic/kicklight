import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { apiError, json, requireUser } from "@/server/auth";
import { transportFor } from "@/server/hue-link";
import { isRgbList } from "@/server/validate";

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as {
    colors?: unknown;
    transitionMs?: unknown;
  } | null;
  if (!isRgbList(body?.colors)) return apiError("bad_colors", 400);
  const transition =
    typeof body?.transitionMs === "number"
      ? Math.min(5000, Math.max(0, body.transitionMs))
      : 300;

  const t = await transportFor(createAdminClient(), user.id);
  if (!t?.link.light_id) return apiError("not_linked", 409);
  try {
    await t.transport.setGradient(body.colors, transition);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof HueRemoteError && e.unauthorized)
      return apiError("hue_unauthorized", 401);
    return apiError("hue_unavailable", 502, (e as Error).message);
  }
}
