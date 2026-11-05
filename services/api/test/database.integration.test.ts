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

test("the migrations create the sixteen tables and protect the ledger", async (context) => {
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
      "fields",
      "institution_domains",
      "institutions",
      "mentor_fields",
      "mentor_profiles",
      "role_assignments",
      "sessions",
      "signup_blocks",
      "student_field_interests",
      "student_profiles",
      "two_factors",
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

  // The owner cannot hard-delete a user the ledger references.
  await assert.rejects(client.query("DELETE FROM users WHERE id = 'user-ledger'"), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "23503");
    return true;
  });

  const consent = await client.query<{ document_version: string }>(
    "SELECT document_version FROM consent_records",
  );
  assert.equal(consent.rows[0]?.document_version, "v1", "the original consent row is unchanged");
  const audit = await client.query<{ action: string }>("SELECT action FROM audit_logs");
  assert.equal(audit.rows[0]?.action, "USER_REGISTERED", "the original audit row is unchanged");
});

test("the application role can use every profile table and nothing else", async (context) => {
  const current = requireDatabase(context);
  if (!current) {
    return;
  }
  const { client } = current;

  await client.query(
    "INSERT INTO users (id, name, email) VALUES ('user-grants', 'Grants Test', 'grants@example.com')",
  );

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE connect_app");

    const field = await client.query<{ id: string }>(
      "INSERT INTO fields (name, normalized_slug, created_by_user_id) VALUES ('Grants field', 'grants field', 'user-grants') RETURNING id",
    );
    const fieldId = field.rows[0].id;
    await client.query("UPDATE fields SET name = 'Grants field renamed' WHERE id = $1", [fieldId]);
    assert.deepEqual(
      (
        await client.query<{ name: string }>("SELECT name FROM fields WHERE id = $1", [fieldId])
      ).rows,
      [{ name: "Grants field renamed" }],
    );

    // `0006` grants the second-factor table (the Sprint 1 audit lesson: a new
    // table that the application role cannot use is a latent outage).
    await client.query(
      "INSERT INTO two_factors (id, secret, backup_codes, user_id) VALUES ('factor-grants', 'enc-secret', 'enc-codes', 'user-grants')",
    );
    await client.query("UPDATE two_factors SET verified = false WHERE id = 'factor-grants'");
    await client.query("DELETE FROM two_factors WHERE id = 'factor-grants'");

    // `0007` grants the role table; registration writes the default role through it.
    const assignment = await client.query<{ id: string }>(
      "INSERT INTO role_assignments (user_id, role) VALUES ('user-grants', 'STUDENT') RETURNING id",
    );
    assert.deepEqual(
      (
        await client.query<{ role: string }>(
          "SELECT role FROM role_assignments WHERE user_id = 'user-grants'",
        )
      ).rows,
      [{ role: "STUDENT" }],
    );
    await client.query("UPDATE role_assignments SET revoked_at = now() WHERE id = $1", [
      assignment.rows[0].id,
    ]);
    await client.query("DELETE FROM role_assignments WHERE id = $1", [assignment.rows[0].id]);

    const student = await client.query<{ id: string }>(
      "INSERT INTO student_profiles (user_id, goals, primary_field_id) VALUES ('user-grants', 'Goals', $1) RETURNING id",
      [fieldId],
    );
    const studentId = student.rows[0].id;
    await client.query(
      "INSERT INTO student_field_interests (student_profile_id, field_id) VALUES ($1, $2)",
      [studentId, fieldId],
    );
    await client.query("UPDATE student_profiles SET goals = 'Goals updated' WHERE id = $1", [
      studentId,
    ]);
    await client.query("DELETE FROM student_field_interests WHERE student_profile_id = $1", [
      studentId,
    ]);

    const mentor = await client.query<{ id: string }>(
      "INSERT INTO mentor_profiles (user_id, primary_field_id, headline, bio, expertise_summary, scope_statement, weekly_capacity) VALUES ('user-grants', $1, 'Headline', 'Bio', 'Summary', 'Scope', 2) RETURNING id",
      [fieldId],
    );
    const mentorId = mentor.rows[0].id;
    await client.query("INSERT INTO mentor_fields (mentor_profile_id, field_id) VALUES ($1, $2)", [
      mentorId,
      fieldId,
    ]);
    await client.query("UPDATE mentor_profiles SET headline = 'Headline updated' WHERE id = $1", [
      mentorId,
    ]);
    await client.query("DELETE FROM mentor_fields WHERE mentor_profile_id = $1", [mentorId]);

    await client.query("DELETE FROM student_profiles WHERE id = $1", [studentId]);
    await client.query("DELETE FROM mentor_profiles WHERE id = $1", [mentorId]);
    await client.query("DELETE FROM fields WHERE id = $1", [fieldId]);
  } finally {
    await client.query("ROLLBACK");
  }

  // A table the application role was never granted is refused.
  await client.query("CREATE TABLE grant_probe (id integer)");
  try {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE connect_app");
      await assert.rejects(client.query("SELECT * FROM grant_probe"), (error: unknown) => {
        assert.equal((error as { code?: string }).code, "42501");
        return true;
      });
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.query("DROP TABLE grant_probe");
  }

  const counts = await client.query<{ fields: number; profiles: number }>(
    "SELECT (SELECT count(*) FROM fields)::int AS fields, (SELECT count(*) FROM student_profiles)::int AS profiles",
  );
  assert.deepEqual(counts.rows[0], { fields: 0, profiles: 0 }, "the probe transaction rolled back");
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
