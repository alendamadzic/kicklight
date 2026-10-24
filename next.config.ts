import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Check every <Link href> and router.push against the routes that exist.
  typedRoutes: true,
  // Native / socket-level packages used only by local mode: load them from node_modules
  // at runtime instead of letting Turbopack try to bundle them.
  serverExternalPackages: [
    "node-dtls-client",
    "node-aead-crypto",
    "multicast-dns",
  ],
  // Settings became Setup in the redesign; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/settings", destination: "/setup", permanent: true }];
  },
  // Pin the workspace root so builds inside a git worktree don't pick up a parent checkout.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
