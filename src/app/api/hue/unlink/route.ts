import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, requireUser } from "@/server/http";
import { deleteLink } from "@/server/hue-link";
import { endLiveSessions } from "@/server/live-sessions";

/** Forget the Hue link. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const admin = createAdminClient();
  try {
    // Give the strip back before the credentials that can do it are gone.
    await endLiveSessions(admin, user.id);
    await deleteLink(admin, user.id);
    return json({ ok: true });
  } catch (e) {
    return apiError("db_error", 500, (e as Error).message);
  }
}
