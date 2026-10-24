import type { HueStatus } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/http";
import { getLink } from "@/server/hue-link";

/** Whether the user has linked Hue, and which strip they chose. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  try {
    const link = await getLink(createAdminClient(), user.id);
    return json({
      linked: Boolean(link),
      transport: link?.transport ?? null,
      lightId: link?.light_id ?? null,
      lightName: link?.light_name ?? null,
      bridgeId: link?.bridge_id ?? null,
      tokenExpiresAt: link?.token_expires_at ?? null,
    } satisfies HueStatus);
  } catch (e) {
    return apiError("db_error", 500, (e as Error).message);
  }
}
