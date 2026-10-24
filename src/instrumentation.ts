// Next calls register() once when the server starts. In local mode (self-hosted on the
// home network) it starts the in-process session loop. In cloud mode Supabase Cron calls
// /api/cron/tick instead. Cron can't reach `next dev`, so with KICKLIGHT_DEV_LOOP=1 the dev
// server drives remote sessions itself. It's opt-in: a dev server pointed at the production
// database would otherwise take live sessions away from the deployed site.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KICKLIGHT_MODE === "local") {
    const { startLocalLoop } = await import("./server/local-loop");
    startLocalLoop();
  } else if (
    process.env.NODE_ENV === "development" &&
    process.env.KICKLIGHT_DEV_LOOP === "1"
  ) {
    const { startDevRemoteLoop } = await import("./server/local-loop");
    startDevRemoteLoop();
  }
}
