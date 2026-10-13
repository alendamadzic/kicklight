import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireUser } from "@/server/auth";
import { transportFor } from "@/server/hue-link";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const admin = createAdminClient();

  // Give the strip back before the credentials that can do it are gone.
  const { data: live } = await admin
    .from("sessions")
    .select("id, light_snapshot")
    .eq("user_id", user.id)
    .in("status", ["active", "paused"]);
  if (live?.length) {
    const t = await transportFor(admin, user.id).catch(() => null);
    for (const s of live) {
      if (t && s.light_snapshot)
        await t.transport.restore(s.light_snapshot).catch(() => {});
    }
    await admin
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .in(
        "id",
        live.map((s) => s.id),
      );
  }

  await admin.from("hue_secrets").delete().eq("user_id", user.id);
  await admin.from("hue_links").delete().eq("user_id", user.id);
  return json({ ok: true });
}
