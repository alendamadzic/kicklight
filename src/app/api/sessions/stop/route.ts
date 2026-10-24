import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/http";
import { endLiveSessions } from "@/server/live-sessions";

/** End the live session and hand the strip back. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  try {
    const stopped = await endLiveSessions(createAdminClient(), user.id);
    return json({ ok: true, stopped });
  } catch (e) {
    return apiError("db_error", 500, (e as Error).message);
  }
}
