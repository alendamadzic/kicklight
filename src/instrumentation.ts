// Next calls register() once when the server starts. In local mode (self-hosted on the
// home network) it starts the in-process session loop; in cloud mode Supabase Cron calls
// /api/cron/tick instead and nothing runs here.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KICKLIGHT_MODE !== "local") return;
  const { startLocalLoop } = await import("./server/local-loop");
  startLocalLoop();
}
