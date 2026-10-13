import type { HueStatus } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireUser } from "@/server/auth";
import { getLink } from "@/server/hue-link";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const link = await getLink(createAdminClient(), user.id);
  const status: HueStatus = {
    linked: Boolean(link),
    transport: link?.transport ?? null,
    lightId: link?.light_id ?? null,
    lightName: link?.light_name ?? null,
    bridgeId: link?.bridge_id ?? null,
    tokenExpiresAt: link?.token_expires_at ?? null,
  };
  return json(status);
}
