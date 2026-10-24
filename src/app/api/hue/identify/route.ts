import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { identifyLightFor } from "@/server/hue-link";
import { parseIdentifyLight } from "@/server/validate";
import { hueErrorResponse } from "@/server/with-transport";

/** Blink one light on the linked bridge, so the viewer can see which strip it is. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = parseIdentifyLight(await readJson(request));
  if (!body) return apiError("bad_request", 400, "Unknown light");
  try {
    if (!(await identifyLightFor(createAdminClient(), user.id, body.lightId)))
      return apiError("not_linked", 409, "Link your Hue bridge first");
    return json({ ok: true });
  } catch (e) {
    return hueErrorResponse(e);
  }
}
