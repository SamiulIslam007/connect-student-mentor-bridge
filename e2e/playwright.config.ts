import { execSync } from "node:child_process";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import {
  API_ORIGIN,
  E2E_BETTER_AUTH_SECRET,
  MAILPIT_HTTP_URL,
  SMTP_PORT,
  WEB_ORIGIN,
  testDatabaseUrl,
} from "./support/env";

const repoRoot = path.join(__dirname, "..");

// Both processes talk to the test database only; the guard throws before any
// browser starts when the URL does not name a `_test` database (D-236).
const DATABASE_URL = testDatabaseUrl();

// Playwright starts `webServer` before `globalSetup`, and the API will not boot
// against a database that does not exist yet, so the database is prepared here.
execSync("node --import tsx e2e/support/prepare.ts", {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
});

const apiEnvironment = {
  NODE_ENV: "development",
  LOG_LEVEL: "error",
  PORT: new URL(API_ORIGIN).port,
  DATABASE_URL,
  BETTER_AUTH_URL: WEB_ORIGIN,
  BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
  // Mailpit, which Compose already runs; the suite needs the sink, not a service.
  SMTP_HOST: new URL(MAILPIT_HTTP_URL).hostname,
  SMTP_PORT,
  SMTP_FROM: "no-reply@connect.local",
};

const webEnvironment = {
  NODE_ENV: "development",
  PORT: new URL(WEB_ORIGIN).port,
  API_INTERNAL_URL: API_ORIGIN,
  NEXT_PUBLIC_API_BASE_URL: API_ORIGIN,
  BETTER_AUTH_URL: WEB_ORIGIN,
};

export default defineConfig({
  testDir: __dirname,
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  // One retry in CI only: a second failure is a failure, and a retry that hides
  // a flake is exactly what this suite exists to prevent (D-237).
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "pnpm --filter api exec node --import tsx src/main.ts",
      cwd: repoRoot,
      url: `${API_ORIGIN}/readyz`,
      env: apiEnvironment,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // A production build, not `next dev`: React's development double mount
      // resets the controlled consent checkbox and the submit button disables itself.
      command: "pnpm --filter web exec next start --hostname 127.0.0.1 --port 3100",
      cwd: repoRoot,
      url: `${WEB_ORIGIN}/healthz`,
      env: webEnvironment,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
