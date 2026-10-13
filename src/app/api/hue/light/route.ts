import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/auth";

export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as {
    lightId?: unknown;
    lightName?: unknown;
  } | null;
  if (
    typeof body?.lightId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.lightId)
  ) {
    return apiError("bad_light", 400);
  }
  const name =
    typeof body.lightName === "string" ? body.lightName.slice(0, 80) : "";
  const { data, error } = await createAdminClient()
    .from("hue_links")
    .update({ light_id: body.lightId, light_name: name })
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return apiError("db_error", 500, error.message);
  if (!data?.length) return apiError("not_linked", 409);
  return json({ ok: true });
}
