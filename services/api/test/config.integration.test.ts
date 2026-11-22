import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AdminConfigController } from "../src/admin-config/config.controller.js";
import {
  assertProductionSecrets,
  productionSecretViolations,
} from "../src/config/production-guard.js";
import { CONFIG_SERVICE } from "../src/admin-config/config.tokens.js";
import { DrizzleConfigService } from "../src/admin-config/drizzle-config.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: [AuthController, AdminConfigController],
    requestIdRoutes: [AuthController, AdminConfigController],
    providers: (database) => [
      { provide: CONFIG_SERVICE, useValue: new DrizzleConfigService(database) },
    ],
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

beforeEach(async () => {
  if (stack) {
    await truncateAll(stack.client);
  }
});

after(async () => {
  await stack?.close();
});

function requireStack(context: TestContext): TestApiStack | null {
  if (!stack) {
    context.skip(skipReason);
    return null;
  }
  return stack;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reason: "Pilot tuning",
    cooling_days: 21,
    difficulty_weights: {
      ADMISSION: 1,
      INTERNSHIP: 1,
      JOB_OFFER: 1,
      SKILL_MILESTONE: 1,
      INTERVIEW: 1,
    },
    tier_multipliers: { "0": 1, "1": 1, "2": 1 },
    contribution_multipliers: { DIRECTLY_ENABLED: 1, HELPED: 1, MINOR: 1 },
    audit_sample_rate: 0.5,
    ...overrides,
  };
}

async function accountId(current: TestApiStack, email: string): Promise<string> {
  const row = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  return row.rows[0].id;
}

/** A platform admin with an enrolled factor, without the TOTP dance. */
async function adminToken(
  current: TestApiStack,
  email = "config-admin@example.com",
  withMfa = true,
): Promise<string> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  const id = await accountId(current, email);
  await current.client.query("INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')", [
    id,
  ]);
  if (withMfa) {
    await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [id]);
  }
  return String(signedIn.body?.session_token);
}

test("the migration seeds version 1, and it is the version in force", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);

  const read = await apiRequest(current, "GET", "/v1/admin/config", undefined, admin);
  assert.equal(read.status, 200, read.text);
  const active = read.body?.active as {
    version: number;
    digest: string;
    payload: Record<string, unknown>;
  };
  assert.equal(active.version, 1);
  assert.equal(active.payload.cooling_days, 14);
  assert.equal(active.payload.audit_sample_rate, 0.25);
  const recomputed = createHash("sha256").update(JSON.stringify(active.payload)).digest("hex");
  assert.equal(active.digest, recomputed, "the digest is recomputable from the stored payload");
  assert.equal(
    (read.body?.data as unknown[]).length,
    1,
    "the baseline is the whole history at this point",
  );
});

test("an admin publishes version 2 with one audit row and history newest first", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  const actorId = await accountId(current, "config-admin@example.com");

  const created = await apiRequest(current, "POST", "/v1/admin/config", validPayload(), admin);
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.version, 2);
  assert.equal(created.body?.created_by_user_id, actorId);
  const digest = createHash("sha256")
    .update(JSON.stringify(created.body?.payload))
    .digest("hex");
  assert.equal(created.body?.digest, digest);

  const audit = await current.client.query<{ action: string; actor_user_id: string; reason: string }>(
    "SELECT action, actor_user_id, reason FROM audit_logs WHERE object_id = $1",
    [created.body?.id],
  );
  assert.deepEqual(audit.rows, [
    { action: "CONFIGURATION_CHANGED", actor_user_id: actorId, reason: "Pilot tuning" },
  ]);

  const read = await apiRequest(current, "GET", "/v1/admin/config", undefined, admin);
  assert.equal((read.body?.active as { version: number }).version, 2);
  assert.deepEqual(
    (read.body?.data as Array<{ version: number }>).map((row) => row.version),
    [2, 1],
    "newest first",
  );

  // The earlier version is untouched.
  const baseline = (read.body?.data as Array<{ version: number; payload: { cooling_days: number } }>)[1];
  assert.equal(baseline.payload.cooling_days, 14);
});

test("history is keyset-paginated on the version number", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  for (const cooling of [15, 16, 17]) {
    const created = await apiRequest(
      current,
      "POST",
      "/v1/admin/config",
      validPayload({ cooling_days: cooling }),
      admin,
    );
    assert.equal(created.status, 201, created.text);
  }

  const first = await apiRequest(current, "GET", "/v1/admin/config?limit=2", undefined, admin);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(
    (first.body?.data as Array<{ version: number }>).map((row) => row.version),
    [4, 3],
  );
  assert.equal(first.body?.next_cursor, 3);

  const second = await apiRequest(
    current,
    "GET",
    `/v1/admin/config?limit=2&cursor=${String(first.body?.next_cursor)}`,
    undefined,
    admin,
  );
  assert.deepEqual(
    (second.body?.data as Array<{ version: number }>).map((row) => row.version),
    [2, 1],
  );
  assert.equal(second.body?.next_cursor, null);
});

test("every refusal writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  const noFactor = await adminToken(current, "config-nofactor@example.com", false);
  const student = await adminToken(current, "config-student@example.com");
  await current.client.query(
    "DELETE FROM role_assignments WHERE user_id = (SELECT id FROM users WHERE email = 'config-student@example.com')",
  );
  const before = await current.client.query<{ count: string }>("SELECT count(*) FROM config_versions");

  const asStudent = await apiRequest(current, "POST", "/v1/admin/config", validPayload(), student);
  assert.equal(asStudent.status, 403, asStudent.text);
  assert.equal(asStudent.body?.code, "ROLE_REQUIRED");

  const asNoFactor = await apiRequest(current, "POST", "/v1/admin/config", validPayload(), noFactor);
  assert.equal(asNoFactor.status, 403, asNoFactor.text);
  assert.equal(asNoFactor.body?.code, "MFA_REQUIRED");

  const anonymous = await apiRequest(current, "POST", "/v1/admin/config", validPayload());
  assert.equal(anonymous.status, 401, anonymous.text);

  const noReason = await apiRequest(
    current,
    "POST",
    "/v1/admin/config",
    validPayload({ reason: "  " }),
    admin,
  );
  assert.equal(noReason.status, 422, noReason.text);

  const outOfRange = await apiRequest(
    current,
    "POST",
    "/v1/admin/config",
    validPayload({ cooling_days: 91 }),
    admin,
  );
  assert.equal(outOfRange.status, 422, outOfRange.text);
  assert.match(String(outOfRange.body?.detail), /cooling_days/);

  const unknownKey = await apiRequest(
    current,
    "POST",
    "/v1/admin/config",
    validPayload({ rate_limits: {} }),
    admin,
  );
  assert.equal(unknownKey.status, 422, unknownKey.text);

  const after = await current.client.query<{ count: string }>("SELECT count(*) FROM config_versions");
  assert.equal(after.rows[0].count, before.rows[0].count, "no version was created");
  const audit = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM audit_logs WHERE action = 'CONFIGURATION_CHANGED'",
  );
  assert.equal(audit.rows[0].count, "0", "no audit row was written");
});

test("the application role can insert a version but never edit one", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await current.client.query("BEGIN");
  try {
    await current.client.query("SET LOCAL ROLE connect_app");
    await current.client.query(
      "INSERT INTO config_versions (version, payload, digest, reason) VALUES (99, '{}'::jsonb, repeat('a', 64), 'probe')",
    );
    await current.client.query("SAVEPOINT edit_probe");
    await assert.rejects(
      current.client.query("UPDATE config_versions SET reason = 'edited' WHERE version = 99"),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "42501");
        return true;
      },
    );
    await current.client.query("ROLLBACK TO SAVEPOINT edit_probe");
    await assert.rejects(current.client.query("DELETE FROM config_versions"), (error: unknown) => {
      assert.equal((error as { code?: string }).code, "42501");
      return true;
    });
  } finally {
    await current.client.query("ROLLBACK");
  }
});

/**
 * SEC-AUDIT-012 (D-261): a production boot refuses an empty or development
 * placeholder secret, names it, and never prints its value.
 */
const PRODUCTION_ENV = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "a-real-generated-secret-value-0123456789",
  BFF_TRUST_SECRET: "another-real-generated-secret-0123456789",
  DATABASE_URL: "postgresql://app:a-real-db-password@db:5432/connect",
};

test("a clean production environment passes the secret guard", () => {
  assert.deepEqual(productionSecretViolations(PRODUCTION_ENV), []);
  assert.doesNotThrow(() => assertProductionSecrets(PRODUCTION_ENV));
});

test("development is never refused", () => {
  assert.deepEqual(
    productionSecretViolations({ NODE_ENV: "development", BETTER_AUTH_SECRET: "" }),
    [],
  );
});

test("an empty required secret fails with its name and no value", () => {
  for (const name of ["BETTER_AUTH_SECRET", "BFF_TRUST_SECRET", "DATABASE_URL"] as const) {
    const environment = { ...PRODUCTION_ENV, [name]: "" };
    assert.deepEqual(productionSecretViolations(environment), [name]);
    assert.throws(
      () => assertProductionSecrets(environment),
      (error: Error) => error.message.includes(name) && !error.message.includes("postgresql://"),
    );
  }
});

test("the documented development placeholders are refused", () => {
  const cases: [string, string][] = [
    ["BETTER_AUTH_SECRET", "local-dev-only"],
    ["BFF_TRUST_SECRET", "test-bff-secret"],
    ["DATABASE_URL", "postgresql://connect:local-dev-only@localhost:55432/connect"],
  ];
  for (const [name, value] of cases) {
    assert.deepEqual(
      productionSecretViolations({ ...PRODUCTION_ENV, [name]: value }),
      [name],
      `${name} must be refused`,
    );
  }
});

test("an optional provider secret set to a placeholder, or without its partner, is refused", () => {
  assert.deepEqual(
    productionSecretViolations({ ...PRODUCTION_ENV, S3_SECRET_ACCESS_KEY: "local-dev-only" }),
    ["S3_SECRET_ACCESS_KEY"],
  );
  assert.deepEqual(
    productionSecretViolations({
      ...PRODUCTION_ENV,
      GOOGLE_CLIENT_SECRET: "a-real-google-secret",
      GOOGLE_CLIENT_ID: "",
    }),
    ["GOOGLE_CLIENT_SECRET"],
  );
  assert.deepEqual(
    productionSecretViolations({
      ...PRODUCTION_ENV,
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "a-real-smtp-password",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "a-real-s3-secret",
    }),
    [],
  );
});
