import type { NextRequest } from "next/server";
import type { TeamColors } from "@/engine/colors";
import type { MirroredCommand } from "@/lib/api-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { restingFromRecent } from "@/lights/render";
import { apiError, json, readJson, requireUser } from "@/server/http";
import { activeStreamFor } from "@/server/local-streaming";
import { parseSetBrightness } from "@/server/validate";
import { withUserTransport } from "@/server/with-transport";

/**
 * The remote's brightness slider. Saves the level (so the next pass keeps it) and, while a
 * match is on the lights, repaints what the strip shows now at that level instead of
 * waiting up to a pass for it. The client sends at most a few of these a second.
 */
export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = parseSetBrightness(await readJson(request));
  if (!body) return apiError("bad_request", 400, "Expected brightness 1-100");

  const admin = createAdminClient();
  const [saved, live] = await Promise.all([
    admin
      .from("preferences")
      .upsert(
        { user_id: user.id, brightness: body.brightness },
        { onConflict: "user_id" },
      ),
    admin
      .from("sessions")
      .select("runner_state")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const error = saved.error ?? live.error;
  if (error) return apiError("db_error", 500, error.message);

  const recent = (live.data?.runner_state?.recent ?? []) as MirroredCommand[];
  const colors = live.data?.runner_state?.colors as TeamColors | undefined;
  // Nothing on the strip yet, or an Entertainment stream owns it (it picks the level up
  // on its next pass; the bridge ignores REST while streaming).
  if (!colors || activeStreamFor(user.id)) return json({ ok: true });

  // The transport reads the level just saved, so this paints at the new brightness.
  return withUserTransport(user.id, async ({ transport }) => {
    await transport.setGradient(
      restingFromRecent(recent, transport.points, colors),
      150,
    );
    return json({ ok: true });
  });
}
