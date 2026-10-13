import type { Rgb } from "@/engine/colors";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/auth";
import { transportFor } from "@/server/hue-link";

export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Light the strip up one segment at a time so the user can see which strip it is. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await transportFor(createAdminClient(), user.id);
  if (!t) return apiError("not_linked", 409);
  if (!t.link.light_id)
    return apiError("no_light", 409, "Choose a strip first");

  const warm: Rgb = [255, 190, 90];
  const dim: Rgb = [0, 0, 0];
  let snapshot: unknown = null;
  try {
    snapshot = await t.transport.snapshot();
    const n = t.transport.points;
    for (let lit = 1; lit <= n; lit++) {
      await t.transport.setGradient(
        Array.from({ length: n }, (_, i) => (i < lit ? warm : dim)),
        200,
      );
      await sleep(450);
    }
    await sleep(500);
    return json({ ok: true });
  } catch (e) {
    return apiError("hue_unavailable", 502, (e as Error).message);
  } finally {
    if (snapshot) await t.transport.restore(snapshot).catch(() => {});
  }
}
