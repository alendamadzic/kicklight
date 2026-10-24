import type { Rgb } from "@/engine/colors";
import { TEST_COLORS, TEST_STEP_MS, testSegment } from "@/lib/strip-test";
import { json, requireUser } from "@/server/http";
import { withUserTransport } from "@/server/with-transport";

export const maxDuration = 30;

const DARK: Rgb = [0, 0, 0];
const HOLD_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Light the strip up one coloured segment at a time, left to right (see lib/strip-test). */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return withUserTransport(user.id, async ({ transport }) => {
    const snapshot = await transport.snapshot();
    try {
      const n = transport.points;
      for (let lit = 1; lit <= TEST_COLORS.length; lit++) {
        await transport.setGradient(
          Array.from({ length: n }, (_, i) => {
            const seg = testSegment(i, n);
            return seg < lit ? TEST_COLORS[seg] : DARK;
          }),
          200,
        );
        await sleep(TEST_STEP_MS);
      }
      await sleep(HOLD_MS);
      return json({ ok: true });
    } finally {
      await transport.restore(snapshot).catch(() => {});
    }
  });
}
