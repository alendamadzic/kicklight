import type { DiscoverResponse } from "@/lib/api-types";
import { discoverBridges } from "@/lights/local/discovery";
import { appMode } from "@/server/config";
import { apiError, json, requireUser } from "@/server/http";

export const maxDuration = 20;

/** Look for Hue bridges on the LAN (local mode only). */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (appMode() !== "local")
    return apiError("not_available", 404, "Bridge discovery needs local mode");
  try {
    const found = await discoverBridges({ timeoutMs: 4000 });
    return json({
      bridges: found.map((b) => ({ id: b.id, ip: b.ip })),
    } satisfies DiscoverResponse);
  } catch (e) {
    return apiError("discovery_failed", 502, (e as Error).message);
  }
}
