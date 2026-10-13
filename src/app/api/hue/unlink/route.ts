import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireUser } from "@/server/auth";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const admin = createAdminClient();
  await admin
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("status", ["active", "paused"]);
  await admin.from("hue_secrets").delete().eq("user_id", user.id);
  await admin.from("hue_links").delete().eq("user_id", user.id);
  return json({ ok: true });
}
