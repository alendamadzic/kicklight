import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pages are a static shell from the edge with data streamed into it from cached server
  // functions ("use cache"). Recently visited routes stay mounted (hidden) for instant back.
  cacheComponents: true,
  cacheLife: {
    // Fixture lists: shared by everyone, live scores may lag by up to ~15 s.
    fixtures: { stale: 15, revalidate: 15, expire: 60 },
    // One match's snapshot for the remote's preview; the strip itself never reads this cache.
    match: { stale: 10, revalidate: 10, expire: 60 },
  },
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
