import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireUser } from "@/server/auth";
import { remoteTransportFor } from "@/server/hue-link";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const admin = createAdminClient();
  const { data: live } = await admin
    .from("sessions")
    .select("id, light_snapshot")
    .eq("user_id", user.id)
    .in("status", ["active", "paused"]);
  if (!live?.length) return json({ ok: true, stopped: 0 });

  const t = await remoteTransportFor(admin, user.id).catch(() => null);
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
  return json({ ok: true, stopped: live.length });
}
