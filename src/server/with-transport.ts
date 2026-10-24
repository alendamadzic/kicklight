import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBridgeUnauthorized } from "@/lights/errors";
import { apiError } from "./http";
import { type LinkedTransport, transportFor } from "./hue-link";

/** The API's answer when talking to the bridge failed. */
export function hueErrorResponse(e: unknown): Response {
  if (isBridgeUnauthorized(e))
    return apiError("hue_unauthorized", 401, "Hue link expired, link again");
  return apiError("hue_unavailable", 502, (e as Error).message);
}

/**
 * Run `fn` with the user's strip. Answers for it when there is no link, no strip chosen,
 * or the bridge can't be reached, so a route only handles the happy path.
 */
export async function withUserTransport(
  userId: string,
  fn: (t: LinkedTransport, admin: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  const admin = createAdminClient();
  try {
    const t = await transportFor(admin, userId);
    if (!t) return apiError("not_linked", 409, "Link your Hue bridge first");
    if (!t.link.light_id)
      return apiError("no_light", 409, "Choose a strip first");
    return await fn(t, admin);
  } catch (e) {
    return hueErrorResponse(e);
  }
}
