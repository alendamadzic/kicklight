import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Native / socket-level packages used only by local mode: load them from node_modules
  // at runtime instead of letting Turbopack try to bundle them.
  serverExternalPackages: [
    "node-dtls-client",
    "node-aead-crypto",
    "multicast-dns",
  ],
  // Pin the workspace root so builds inside a git worktree don't pick up a parent checkout.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
