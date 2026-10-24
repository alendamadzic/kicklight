import type { NextRequest } from "next/server";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { parseSetLights } from "@/server/validate";
import { withUserTransport } from "@/server/with-transport";

/** Show a steady gradient on the user's strip (the demo's "send to my lights"). */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = parseSetLights(await readJson(request));
  if (!body) return apiError("bad_request", 400, "Expected 1-27 RGB colours");
  return withUserTransport(user.id, async ({ transport }) => {
    await transport.setGradient(body.colors, body.transitionMs);
    return json({ ok: true });
  });
}
