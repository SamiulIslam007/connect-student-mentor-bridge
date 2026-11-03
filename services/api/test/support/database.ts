import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import assert from "node:assert/strict";
import { Client } from "pg";

import { resolveDatabaseUrl } from "../../src/db/database-url.js";

/**
 * Integration tests run against the Compose Postgres. They use a dedicated
 * `connect_test` database so they never touch development data, and they skip
 * (loudly) when no database is configured or reachable, which is the CI case.
 */
function deriveTestDatabaseUrl(): string | null {
  const configured = process.env.TEST_DATABASE_URL;
  if (configured) {
    return configured;
  }

  try {
    const url = new URL(resolveDatabaseUrl());
    url.pathname = "/connect_test";
    return url.toString();
  } catch {
    // No DATABASE_URL anywhere: there is nothing to connect to, so the caller
    // reports a skip instead of failing the suite.
    return null;
  }
}

const derivedTestDatabaseUrl = deriveTestDatabaseUrl();

export function testDatabaseUrl(): string {
  if (!derivedTestDatabaseUrl) {
    throw new Error("DATABASE_URL is not configured (integration tests need the Compose Postgres)");
  }
  return derivedTestDatabaseUrl;
}

export interface TestDatabase {
  client: Client;
  skipped: boolean;
  /** Why the database was unreachable; printed by a skipped test. */
  reason?: string;
}

export async function openTestDatabase(): Promise<TestDatabase> {
  const client = new Client({
    connectionString: derivedTestDatabaseUrl ?? "",
    connectionTimeoutMillis: 2_000,
  });

  if (!derivedTestDatabaseUrl) {
    return {
      client,
      skipped: true,
      reason: "DATABASE_URL is not configured; integration tests need the Compose Postgres",
    };
  }

  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown connection error";
    return { client, skipped: true, reason: `connect_test is not reachable: ${message}` };
  }

  return { client, skipped: false };
}

const migrationsDirectory = resolve(process.cwd(), "drizzle");

/** Destructive reset of the test database, then every migration in order. */
export async function resetDatabase(client: Client): Promise<void> {
  assert.ok(
    (client.database ?? "").endsWith("_test"),
    `refusing to reset "${client.database}": the test database name must end with _test`,
  );

  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");

  const files = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await client.query(statement);
      }
    }
  }
}

export async function truncateAll(client: Client): Promise<void> {
  await client.query(
    "TRUNCATE TABLE audit_logs, consent_records, signup_blocks, sessions, accounts, verifications, users RESTART IDENTITY CASCADE",
  );
}
