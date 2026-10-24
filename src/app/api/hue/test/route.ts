import type { Rgb } from "@/engine/colors";
import { json, requireUser } from "@/server/http";
import { withUserTransport } from "@/server/with-transport";

export const maxDuration = 30;

const WARM: Rgb = [255, 190, 90];
const DARK: Rgb = [0, 0, 0];
const STEP_MS = 450;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Light the strip up one segment at a time so the user can see which strip it is. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return withUserTransport(user.id, async ({ transport }) => {
    const snapshot = await transport.snapshot();
    try {
      const n = transport.points;
      for (let lit = 1; lit <= n; lit++) {
        await transport.setGradient(
          Array.from({ length: n }, (_, i) => (i < lit ? WARM : DARK)),
          200,
        );
        await sleep(STEP_MS);
      }
      await sleep(500);
      return json({ ok: true });
    } finally {
      await transport.restore(snapshot).catch(() => {});
    }
  });
}
