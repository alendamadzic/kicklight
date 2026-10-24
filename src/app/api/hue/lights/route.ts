import type { HueLightsResponse } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/http";
import { listLightsFor } from "@/server/hue-link";
import { hueErrorResponse } from "@/server/with-transport";

/** Gradient-capable lights on the linked bridge. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  try {
    const lights = await listLightsFor(createAdminClient(), user.id);
    if (!lights)
      return apiError("not_linked", 409, "Link your Hue bridge first");
    return json({ lights } satisfies HueLightsResponse);
  } catch (e) {
    return hueErrorResponse(e);
  }
}
