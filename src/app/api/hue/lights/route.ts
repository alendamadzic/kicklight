import type { HueLightsResponse } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { HueRemoteError } from "@/lights/remote";
import { apiError, json, requireUser } from "@/server/auth";
import { remoteTransportFor } from "@/server/hue-link";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await remoteTransportFor(createAdminClient(), user.id);
  if (!t) return apiError("not_linked", 409, "Link your Hue bridge first");
  try {
    const lights = await t.transport.listGradientLights();
    const body: HueLightsResponse = { lights };
    return json(body);
  } catch (e) {
    if (e instanceof HueRemoteError && e.unauthorized)
      return apiError("hue_unauthorized", 401, "Hue link expired, link again");
    return apiError("hue_unavailable", 502, (e as Error).message);
  }
}
