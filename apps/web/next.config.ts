import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container image builds a standalone server; local `pnpm start` uses `next start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@connect/config", "@connect/contracts", "@connect/domain"],
  // Turbopack cannot see host file events through a Docker bind mount; polling
  // is enabled by the development overlay only.
  watchOptions:
    process.env.TURBOPACK_POLL === "true" ? { pollIntervalMs: 1_000 } : undefined,
};

export default nextConfig;
