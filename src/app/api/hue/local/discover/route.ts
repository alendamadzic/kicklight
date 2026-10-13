import type { DiscoverResponse } from "@/lib/api-types";
import { discoverBridges } from "@/lights/local/discovery";
import { apiError, appMode, json, requireUser } from "@/server/auth";

export const maxDuration = 20;

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (appMode() !== "local")
    return apiError("not_available", 404, "Bridge discovery needs local mode");
  try {
    const found = await discoverBridges({ timeoutMs: 4000 });
    const body: DiscoverResponse = {
      bridges: found.map((b) => ({ id: b.id, ip: b.ip })),
    };
    return json(body);
  } catch (e) {
    return apiError("discovery_failed", 502, (e as Error).message);
  }
}
