import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createDatabaseConnection } from "../../services/api/src/db/database.ts";
import {
  API_ORIGIN,
  E2E_BETTER_AUTH_SECRET,
  MAILPIT_HTTP_URL,
  WEB_ORIGIN,
  testDatabaseUrl,
} from "./env";
import { mentor } from "./actors";
import { labels } from "./labels";

/**
 * Run before the web servers start (the config imports this file), because
 * Playwright starts `webServer` before `globalSetup` and the API refuses to boot
 * against a database that does not exist.
 *
 * Its own database, rebuilt every run: `connect_test` belongs to the integration
 * suite, which replays the migrations itself and leaves drizzle's journal empty,
 * so `drizzle-kit migrate` cannot run there. A drop and a create take seconds and
 * make a failed run impossible to mistake for stale state.
 */
async function resetDatabase(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.replace(/^\//, "");
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  const connection = createDatabaseConnection(adminUrl.toString());
  try {
    await connection.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await connection.pool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await connection.pool.end();
  }
}

const env = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl(),
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
  SEED_DEMO_MENTORS: "1",
};

const repoRoot = `${__dirname}/../..`;

/**
 * The labels are copied, not imported (Playwright only transforms the test
 * directory), so the catalog stays the source: a renamed string fails the run
 * here instead of failing later as a missing element.
 */
function checkLabels(): void {
  const catalog = readFileSync(path.join(repoRoot, "apps/web/lib/strings.ts"), "utf8");
  const flat = JSON.stringify(labels)
    .match(/"([^"]{4,})"/g)
    ?.map((value) => value.slice(1, -1))
    .filter((value) => !value.includes("_")) ?? [];
  const missing = flat.filter((value) => !catalog.includes(value));
  if (missing.length > 0) {
    throw new Error(`e2e labels missing from apps/web/lib/strings.ts: ${missing.join(" | ")}`);
  }
  const seed = readFileSync(path.join(repoRoot, "services/api/src/db/seed/demo-constants.ts"), "utf8");
  const mentors = readFileSync(path.join(repoRoot, "services/api/src/db/seed/demo-mentors.ts"), "utf8");
  if (!seed.includes(`"${mentor.email}"`) || !mentors.includes(`"${mentor.displayName}"`)) {
    throw new Error("the seeded demo mentor changed; update e2e/support/actors.ts");
  }
  const config = readFileSync(path.join(repoRoot, "packages/config/src/index.ts"), "utf8");
  if (!/SIGNUP_MIN_SUBMIT_SECONDS\s*=\s*2\b/.test(config)) {
    throw new Error("SIGNUP_MIN_SUBMIT_SECONDS is no longer 2; e2e/support/labels.ts must change");
  }
}

/** Compose runs Mailpit locally; CI starts it as a service container, so wait for it. */
async function waitForMailpit(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${MAILPIT_HTTP_URL}/api/v1/messages?limit=1`);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mailpit did not answer at ${MAILPIT_HTTP_URL}`);
}

async function main(): Promise<void> {
  checkLabels();
  await waitForMailpit();
  await resetDatabase();
  execSync("pnpm --filter api db:migrate", { env, stdio: "inherit", cwd: repoRoot });
  execSync("pnpm --filter api db:seed:demo", { env, stdio: "inherit", cwd: repoRoot });
  // The web app is served from a production build: `next dev`'s double mount makes
  // the controlled consent checkbox untestable. NEXT_PUBLIC_* is inlined here, so
  // the build and `next start` must share the same environment.
  const buildEnv: NodeJS.ProcessEnv = { ...process.env };
  // A development NODE_ENV from a sourced .env makes `next build` fail on a React
  // null read; the build must run as a production build.
  delete buildEnv.NODE_ENV;
  Object.assign(buildEnv, {
    BETTER_AUTH_URL: WEB_ORIGIN,
    API_INTERNAL_URL: API_ORIGIN,
    NEXT_PUBLIC_API_BASE_URL: API_ORIGIN,
  });
  execSync("pnpm --filter web build", { env: buildEnv, stdio: "inherit", cwd: repoRoot });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
