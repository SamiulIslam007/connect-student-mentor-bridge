import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { createDatabaseConnection } from "../src/db/database.js";
import { DATABASE_PROBE, defaultProbe, HealthController } from "../src/health/health.controller.js";
import { openTestDatabase, resetDatabase, testDatabaseUrl, type TestDatabase } from "./support/database.js";

let database: TestDatabase | undefined;

before(async () => {
  database = await openTestDatabase();
  if (!database.skipped && database.client) {
    await resetDatabase(database.client);
  }
});

after(async () => {
  if (database && !database.skipped) {
    await database.client.end();
  }
});

function requireDatabase(context: TestContext): TestDatabase | undefined {
  if (!database || database.skipped) {
    context.skip(database?.reason ?? "connect_test is not reachable");
    return undefined;
  }
  return database;
}

async function expectPermissionDenied(client: TestDatabase["client"], sql: string): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE connect_app");
    await assert.rejects(client.query(sql), (error: unknown) => {
      assert.equal((error as { code?: string }).code, "42501", `${sql} must be refused`);
      return true;
    });
  } finally {
    await client.query("ROLLBACK");
  }
}

test("the baseline migration creates the nine tables and protects the ledger", async (context) => {
  const current = requireDatabase(context);
  if (!current) {
    return;
  }
  const { client } = current;

  const tables = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    [
      "accounts",
      "audit_logs",
      "consent_records",
      "institution_domains",
      "institutions",
      "sessions",
      "signup_blocks",
      "users",
      "verifications",
    ],
  );

  await client.query(
    "INSERT INTO users (id, name, email) VALUES ('user-ledger', 'Ledger Test', 'ledger@example.com')",
  );
  await client.query(
    "INSERT INTO consent_records (user_id, purpose, action, document_version) VALUES ('user-ledger', 'TERMS', 'GRANTED', 'v1')",
  );
  await client.query(
    "INSERT INTO audit_logs (actor_user_id, action, object_type, object_id, request_id) VALUES ('user-ledger', 'USER_REGISTERED', 'users', 'user-ledger', 'req-1')",
  );

  await expectPermissionDenied(client, "UPDATE consent_records SET document_version = 'v2'");
  await expectPermissionDenied(client, "DELETE FROM consent_records");
  await expectPermissionDenied(client, "UPDATE audit_logs SET action = 'TAMPERED'");
  await expectPermissionDenied(client, "DELETE FROM audit_logs");

  const consent = await client.query<{ document_version: string }>(
    "SELECT document_version FROM consent_records",
  );
  assert.equal(consent.rows[0]?.document_version, "v1", "the original consent row is unchanged");
  const audit = await client.query<{ action: string }>("SELECT action FROM audit_logs");
  assert.equal(audit.rows[0]?.action, "USER_REGISTERED", "the original audit row is unchanged");
});

test("a pooled connection opens a transaction and readiness reports the database", async (context) => {
  if (!requireDatabase(context)) {
    return;
  }

  const url = testDatabaseUrl();
  const connection = createDatabaseConnection(url);
  try {
    const value = await connection.db.transaction(async (tx) => {
      const result = await tx.execute<{ value: number }>("SELECT 1 AS value");
      return result.rows[0]?.value;
    });
    assert.equal(value, 1);

    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;

    @Module({
      controllers: [HealthController],
      providers: [{ provide: DATABASE_PROBE, useValue: defaultProbe }],
    })
    class ReadinessTestModule {}

    const app: INestApplication = await NestFactory.create(ReadinessTestModule, { logger: false });
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/readyz`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok", checks: { database: "ok" } });
    } finally {
      await app.close();
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  } finally {
    await connection.pool.end();
  }
});
