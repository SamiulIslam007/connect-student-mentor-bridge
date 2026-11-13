import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { AUDIT_ACTIONS } from "../src/audit/audit.service.js";
import { AUDIT_SERVICE } from "../src/audit/audit.tokens.js";
import { AuditController } from "../src/audit/audit.controller.js";
import { DrizzleAuditService } from "../src/audit/drizzle-audit.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

const CONTROLLERS = [AuthController, AuditController];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      { provide: AUDIT_SERVICE, useValue: new DrizzleAuditService(database) },
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

async function signInToken(current: TestApiStack, email: string): Promise<string> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  return String(signedIn.body?.session_token);
}

async function accountId(current: TestApiStack, email: string): Promise<string> {
  const result = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  assert.ok(result.rows[0], `${email} must exist`);
  return result.rows[0].id;
}

async function adminToken(current: TestApiStack, email = "admin@example.com"): Promise<string> {
  const token = await signInToken(current, email);
  const id = await accountId(current, email);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [id],
  );
  // The admin routes require an enrolled factor; the guard reads this column.
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [id]);
  return token;
}

interface SeededAudit {
  ids: string[];
  actorA: string;
  actorB: string;
}

/**
 * Four rows with fixed instants so ordering and the keyset cursor are asserted
 * against known values, not against whatever the clock produced.
 */
async function seedAudit(current: TestApiStack): Promise<SeededAudit> {
  await registerAndVerify(current, "actor.a@example.com");
  await registerAndVerify(current, "actor.b@example.com");
  const actorA = await accountId(current, "actor.a@example.com");
  const actorB = await accountId(current, "actor.b@example.com");
  const rows: [string, string, string, string, string, string | null, boolean, string | null][] = [
    ["2030-01-01T10:00:00.000Z", actorA, "SIGN_IN_SUCCEEDED", "users", actorA, "req-1", false, null],
    [
      "2030-01-01T11:00:00.000Z",
      actorA,
      "CONSENT_GRANTED",
      "CONSENT_RECORD",
      "consent-1",
      "req-2",
      false,
      null,
    ],
    [
      "2030-01-01T12:00:00.000Z",
      actorB,
      "OUTCOME_CONFIRMED",
      "outcomes",
      "outcome-1",
      "req-3",
      false,
      null,
    ],
    [
      "2030-01-01T13:00:00.000Z",
      actorA,
      "THREAD_BREAK_GLASS_READ",
      "MENTORSHIP",
      "mentorship-1",
      "req-4",
      true,
      "the reporter named this message",
    ],
  ];
  const ids: string[] = [];
  for (const [occurredAt, actor, action, objectType, objectId, requestId, breakGlass, reason] of rows) {
    const inserted = await current.client.query<{ id: string }>(
      `INSERT INTO audit_logs
         (occurred_at, actor_user_id, actor_role, action, object_type, object_id, request_id, break_glass, reason)
       VALUES ($1, $2, 'USER', $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [occurredAt, actor, action, objectType, objectId, requestId, breakGlass, reason],
    );
    ids.push(inserted.rows[0].id);
  }
  return { ids, actorA, actorB };
}

async function auditCount(current: TestApiStack): Promise<string> {
  const result = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs",
  );
  return result.rows[0].count;
}

test("the four refusals write nothing and leak no row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  const mentor = await signInToken(current, "mentor@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'MENTOR')",
    [await accountId(current, "mentor@example.com")],
  );
  const institutionAdmin = await signInToken(current, "institution@example.edu.bd");
  const institution = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ('Audit University', 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
  );
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role, institution_id) VALUES ($1, 'INSTITUTION_ADMIN', $2)",
    [await accountId(current, "institution@example.edu.bd"), institution.rows[0].id],
  );
  await seedAudit(current);
  const beforeRows = await current.client.query<{ id: string }>("SELECT id FROM audit_logs");

  const anonymous = await apiRequest(current, "GET", "/v1/admin/audit");
  assert.equal(anonymous.status, 401, anonymous.text);

  const asMentor = await apiRequest(current, "GET", "/v1/admin/audit", undefined, mentor);
  assert.equal(asMentor.status, 403, asMentor.text);

  const asInstitution = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit",
    undefined,
    institutionAdmin,
  );
  assert.equal(asInstitution.status, 403, asInstitution.text);

  await current.client.query("UPDATE users SET two_factor_enabled = false WHERE email = 'admin@example.com'");
  const noFactor = await apiRequest(current, "GET", "/v1/admin/audit", undefined, admin);
  assert.equal(noFactor.status, 403, noFactor.text);
  assert.equal(noFactor.body?.code, "MFA_REQUIRED");

  // The read itself writes nothing; the three sensitive refusals each write one
  // denial row, which is the point of D-152.
  const after = await current.client.query<{ id: string; action: string }>(
    "SELECT id, action FROM audit_logs ORDER BY occurred_at, id",
  );
  const beforeIds = new Set(beforeRows.rows.map((row) => row.id));
  const added = after.rows.filter((row) => !beforeIds.has(row.id));
  assert.deepEqual(
    added.map((row) => row.action),
    ["PERMISSION_DENIED", "PERMISSION_DENIED", "PERMISSION_DENIED"],
    "one denial row per sensitive refusal and none for the anonymous 401",
  );
  assert.equal(Number(await auditCount(current)), beforeRows.rows.length + added.length);
});

test("a page carries the ten reviewed keys and never metadata, prev_hash or hash", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  await seedAudit(current);

  const read = await apiRequest(current, "GET", "/v1/admin/audit?from=2030-01-01&to=2030-01-01", undefined, admin);
  assert.equal(read.status, 200, read.text);
  const body = read.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["data", "next_cursor"]);

  const rows = body.data as Record<string, unknown>[];
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "action",
      "actor_role",
      "actor_user_id",
      "break_glass",
      "id",
      "object_id",
      "object_type",
      "occurred_at",
      "reason",
      "request_id",
    ]);
  }
  assert.equal(rows[0].action, "THREAD_BREAK_GLASS_READ", "newest first");
  assert.equal(rows[0].break_glass, true);
  assert.equal(rows[0].reason, "the reporter named this message");
});

test("each filter narrows, and two filters combine", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  const seeded = await seedAudit(current);

  const byAction = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?from=2030-01-01&to=2030-01-01&action=CONSENT_GRANTED",
    undefined,
    admin,
  );
  assert.equal(byAction.status, 200, byAction.text);
  assert.equal((byAction.body?.data as unknown[]).length, 1);

  const byActor = await apiRequest(
    current,
    "GET",
    `/v1/admin/audit?from=2030-01-01&to=2030-01-01&actor=${seeded.actorB}`,
    undefined,
    admin,
  );
  assert.equal(byActor.status, 200, byActor.text);
  assert.equal((byActor.body?.data as unknown[]).length, 1);
  assert.equal((byActor.body?.data as { action: string }[])[0].action, "OUTCOME_CONFIRMED");

  const byObjectType = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?from=2030-01-01&to=2030-01-01&object_type=CONSENT_RECORD",
    undefined,
    admin,
  );
  assert.equal(byObjectType.status, 200, byObjectType.text);
  assert.equal((byObjectType.body?.data as unknown[]).length, 1);

  const byObjectId = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?from=2030-01-01&to=2030-01-01&object_id=outcome-1",
    undefined,
    admin,
  );
  assert.equal(byObjectId.status, 200, byObjectId.text);
  assert.equal((byObjectId.body?.data as unknown[]).length, 1);

  const combined = await apiRequest(
    current,
    "GET",
    `/v1/admin/audit?from=2030-01-01&to=2030-01-01&actor=${seeded.actorA}&action=THREAD_BREAK_GLASS_READ`,
    undefined,
    admin,
  );
  assert.equal(combined.status, 200, combined.text);
  assert.equal((combined.body?.data as unknown[]).length, 1, "actor and action together");
  assert.equal(
    (combined.body?.data as { id: string }[])[0].id,
    seeded.ids[3],
    "the row both filters name",
  );

  const wrongPair = await apiRequest(
    current,
    "GET",
    `/v1/admin/audit?from=2030-01-01&to=2030-01-01&actor=${seeded.actorB}&action=CONSENT_GRANTED`,
    undefined,
    admin,
  );
  assert.equal(wrongPair.status, 200, wrongPair.text);
  assert.equal((wrongPair.body?.data as unknown[]).length, 0, "filters are ANDed");
});

test("the date range is inclusive on both days", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  await seedAudit(current);

  const sameDay = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?from=2030-01-01&to=2030-01-01",
    undefined,
    admin,
  );
  assert.equal((sameDay.body?.data as unknown[]).length, 4);

  const afterThatDay = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?from=2030-01-02",
    undefined,
    admin,
  );
  assert.equal((afterThatDay.body?.data as unknown[]).length, 0);

  const beforeThatDay = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?to=2025-12-31",
    undefined,
    admin,
  );
  assert.equal((beforeThatDay.body?.data as unknown[]).length, 0);
});

test("a malformed filter is a 422 naming its parameter", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);

  const cases: [string, RegExp][] = [
    ["?action=NOT_AN_ACTION", /action/],
    ["?object_type=not_a_type", /object_type/],
    ["?actor=not%20an%20id", /actor/],
    ["?from=2030-13-01", /from/],
    ["?from=2026-11-02&to=2026-11-01", /from/],
    ["?limit=0", /limit/],
    ["?limit=101", /limit/],
    ["?cursor=nonsense", /cursor/],
  ];

  for (const [query, field] of cases) {
    const refused = await apiRequest(current, "GET", `/v1/admin/audit${query}`, undefined, admin);
    assert.equal(refused.status, 422, `${query}: ${refused.text}`);
    assert.match(String(refused.body?.detail ?? ""), field, `${query} names its parameter`);
  }
});

test("every action a writer emits is a filter value", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);

  // Every action the writers can emit is a value the filter accepts (D-153); the
  // list is derived from the source, so a new action is covered without editing
  // the test.
  for (const action of AUDIT_ACTIONS) {
    const page = await apiRequest(current, "GET", `/v1/admin/audit?action=${action}`, undefined, admin);
    assert.equal(page.status, 200, `${action}: ${page.text}`);
  }
});

test("keyset paging stays stable while a newer row is appended", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  const seeded = await seedAudit(current);

  const first = await apiRequest(current, "GET", "/v1/admin/audit?from=2030-01-01&to=2030-01-01&limit=2", undefined, admin);
  assert.equal(first.status, 200, first.text);
  const firstRows = first.body?.data as { id: string }[];
  assert.deepEqual(
    firstRows.map((row) => row.id),
    [seeded.ids[3], seeded.ids[2]],
  );
  const cursor = first.body?.next_cursor;
  assert.ok(cursor, "a full page carries a cursor");

  // A row that sorts above the cursor must not shift the second page.
  await current.client.query(
    `INSERT INTO audit_logs (occurred_at, actor_role, action, object_type, request_id)
     VALUES ('2030-01-01T14:00:00.000Z', 'USER', 'SIGN_IN_SUCCEEDED', 'users', 'req-5')`,
  );

  const second = await apiRequest(
    current,
    "GET",
    `/v1/admin/audit?from=2030-01-01&to=2030-01-01&limit=2&cursor=${encodeURIComponent(String(cursor))}`,
    undefined,
    admin,
  );
  assert.equal(second.status, 200, second.text);
  assert.deepEqual(
    (second.body?.data as { id: string }[]).map((row) => row.id),
    [seeded.ids[1], seeded.ids[0]],
    "the cursor continues where the first page stopped",
  );
  assert.equal(second.body?.next_cursor, null, "the last page has no cursor");
});

test("the service's own select never names metadata, prev_hash or hash", () => {
  // The payload builder is the wire guard; this pins the query too, so a column
  // added to the select cannot ride along unnoticed (design R2, acceptance 1).
  const source = readFileSync(
    fileURLToPath(new URL("../src/audit/drizzle-audit.service.ts", import.meta.url)),
    "utf8",
  );
  const select = source.slice(source.indexOf("const COLUMNS"), source.indexOf("} as const;"));
  for (const forbidden of ["metadata", "prevHash", "prev_hash", "hash:"]) {
    assert.ok(!select.includes(forbidden), `the select must not carry ${forbidden}`);
  }
});

test("reading the log writes no audit row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const admin = await adminToken(current);
  await seedAudit(current);
  const before = await auditCount(current);

  await apiRequest(current, "GET", "/v1/admin/audit", undefined, admin);
  await apiRequest(current, "GET", "/v1/admin/audit?from=2030-01-01&to=2030-01-01&limit=2", undefined, admin);

  assert.equal(await auditCount(current), before, "two reads change no row count");
  const reads = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action LIKE 'AUDIT%'",
  );
  assert.equal(reads.rows[0].count, "0", "no read action exists");
});
