import path from "node:path";
import type { NextConfig } from "next";

import { WEB_SECURITY_HEADERS, WEB_SECURITY_HEADERS_SOURCE } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // The container image builds a standalone server; local `pnpm start` uses `next start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // better-auth's OAuth redirect_uri is <baseURL>/api/auth/callback/<provider>
  // (verified live); the app's handler lives at /callback/google.
  async rewrites() {
    return [{ source: "/api/auth/callback/google", destination: "/callback/google" }];
  },
  // Every response carries the header set; the CSP is report-only for now (R4).
  async headers() {
    return [{ source: WEB_SECURITY_HEADERS_SOURCE, headers: [...WEB_SECURITY_HEADERS] }];
  },
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@connect/config", "@connect/contracts", "@connect/domain"],
  // Turbopack cannot see host file events through a Docker bind mount; polling
  // is enabled by the development overlay only.
  watchOptions:
    process.env.TURBOPACK_POLL === "true" ? { pollIntervalMs: 1_000 } : undefined,
};

export default nextConfig;
