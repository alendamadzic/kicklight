import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { chooseLight } from "@/server/hue-link";
import { parseSelectLight } from "@/server/validate";

/** Choose which strip on the linked bridge the lights follow. */
export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = parseSelectLight(await readJson(request));
  if (!body) return apiError("bad_request", 400, "Unknown light");
  try {
    if (!(await chooseLight(createAdminClient(), user.id, body)))
      return apiError("not_linked", 409, "Link your Hue bridge first");
    return json({ ok: true });
  } catch (e) {
    return apiError("db_error", 500, (e as Error).message);
  }
}
