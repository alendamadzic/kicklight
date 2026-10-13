// Next calls register() once when the server starts. In local mode (self-hosted on the
// home network) it starts the in-process session loop. In cloud mode Supabase Cron calls
// /api/cron/tick instead, but cron can't reach `next dev`, so the dev server drives remote
// sessions itself (the claim in runDueSessions is atomic, so a real cron never double-runs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KICKLIGHT_MODE === "local") {
    const { startLocalLoop } = await import("./server/local-loop");
    startLocalLoop();
  } else if (process.env.NODE_ENV === "development") {
    const { startDevRemoteLoop } = await import("./server/local-loop");
    startDevRemoteLoop();
  }
}
