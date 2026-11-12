import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { DrizzleReportsService } from "../src/reports/drizzle-reports.service.js";
import { ReportsAdminController } from "../src/reports/admin.controller.js";
import { ReportsController } from "../src/reports/reports.controller.js";
import { REPORTS_SERVICE } from "../src/reports/reports.tokens.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

const CONTROLLERS = [AuthController, ReportsController, ReportsAdminController];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      { provide: REPORTS_SERVICE, useValue: new DrizzleReportsService(database) },
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

async function adminToken(current: TestApiStack, email = "admin@example.com"): Promise<string> {
  const token = await signInToken(current, email);
  const user = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [user.rows[0].id],
  );
  // The admin routes require an enrolled second factor; the guard reads this column.
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [
    user.rows[0].id,
  ]);
  return token;
}

/** A mentorship with one message from each side, seeded directly. */
async function seedThread(
  current: TestApiStack,
): Promise<{ studentId: string; mentorId: string; messageId: string; mentorshipId: string }> {
  const { client } = current;
  const student = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "student@example.com",
  ]);
  const mentor = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "mentor@example.com",
  ]);
  const field = await client.query<{ id: string }>(
    "INSERT INTO fields (name, normalized_slug, created_by_user_id) VALUES ('Reports field', 'reports field', $1) RETURNING id",
    [mentor.rows[0].id],
  );
  const studentProfile = await client.query<{ id: string }>(
    "INSERT INTO student_profiles (user_id, goals, primary_field_id) VALUES ($1, 'Goals', $2) RETURNING id",
    [student.rows[0].id, field.rows[0].id],
  );
  const mentorProfile = await client.query<{ id: string }>(
    "INSERT INTO mentor_profiles (user_id, primary_field_id, status, onboarding_status, headline, bio, expertise_summary, scope_statement, weekly_capacity) VALUES ($1, $2, 'ACTIVE', 'AFFILIATION_VERIFIED', 'Headline', 'Bio', 'Expertise', 'Scope', 2) RETURNING id",
    [mentor.rows[0].id, field.rows[0].id],
  );
  const request = await client.query<{ id: string }>(
    "INSERT INTO mentorship_requests (student_profile_id, mentor_profile_id, field_id, question, context_summary, target_outcome, timeframe, expires_at) VALUES ($1, $2, $3, 'Question', 'Context', 'Outcome', 'WITHIN_1_MONTH', now() + interval '2 days') RETURNING id",
    [studentProfile.rows[0].id, mentorProfile.rows[0].id, field.rows[0].id],
  );
  const mentorship = await client.query<{ id: string }>(
    "INSERT INTO mentorships (request_id, student_profile_id, mentor_profile_id, field_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [request.rows[0].id, studentProfile.rows[0].id, mentorProfile.rows[0].id, field.rows[0].id],
  );
  const message = await client.query<{ id: string }>(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body) VALUES ($1, $2, 'A message in the thread') RETURNING id",
    [mentorship.rows[0].id, mentor.rows[0].id],
  );
  return {
    studentId: student.rows[0].id,
    mentorId: mentor.rows[0].id,
    messageId: message.rows[0].id,
    mentorshipId: mentorship.rows[0].id,
  };
}

test("a participant can report a message in their own thread", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const seeded = await seedThread(current);

  const created = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "message", target_id: seeded.messageId, reason: "harassment", details: "It was hostile." },
    token,
  );
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.status, "open");
  assert.equal(created.body?.target_kind, "message");

  const rows = await current.client.query<{ status: string; reporter_user_id: string }>(
    "SELECT status, reporter_user_id FROM reports",
  );
  assert.deepEqual(rows.rows, [{ status: "OPEN", reporter_user_id: seeded.studentId }]);
});

test("a message the reporter cannot see is refused with 404 and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const stranger = await signInToken(current, "stranger@example.com");
  const seeded = await seedThread(current);

  const refused = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "message", target_id: seeded.messageId, reason: "spam" },
    stranger,
  );
  assert.equal(refused.status, 404, refused.text);
  const rows = await current.client.query("SELECT id FROM reports");
  assert.equal(rows.rowCount, 0);
});

test("a malformed target or reason is refused with 422", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");

  for (const body of [
    { target_kind: "planet", target_id: "00000000-0000-0000-0000-000000000000", reason: "spam" },
    { target_kind: "message", target_id: "not-a-uuid", reason: "spam" },
    { target_kind: "user", target_id: "someone", reason: "because" },
  ]) {
    const refused = await apiRequest(current, "POST", "/v1/reports", body, token);
    assert.equal(refused.status, 422, JSON.stringify(body));
    assert.equal(refused.body?.code, "VALIDATION_FAILED");
  }

  const signedOut = await apiRequest(current, "POST", "/v1/reports", {
    target_kind: "user",
    target_id: "someone",
    reason: "spam",
  });
  assert.equal(signedOut.status, 401);
});

test("the queue needs the platform admin role and an enrolled second factor", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const student = await signInToken(current, "student@example.com");

  const noRole = await apiRequest(current, "GET", "/v1/reports", undefined, student);
  assert.equal(noRole.status, 403);
  assert.equal(noRole.body?.code, "ROLE_REQUIRED");

  const admin = await adminToken(current);
  await current.client.query("UPDATE users SET two_factor_enabled = false WHERE email = 'admin@example.com'");
  const noFactor = await apiRequest(current, "GET", "/v1/reports", undefined, admin);
  assert.equal(noFactor.status, 403);
  assert.equal(noFactor.body?.code, "MFA_REQUIRED");

  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE email = 'admin@example.com'");
  const queue = await apiRequest(current, "GET", "/v1/reports", undefined, admin);
  assert.equal(queue.status, 200, queue.text);
  assert.deepEqual(queue.body, { data: [], next_cursor: null });
});

test("a report is resolved once, the reporter is emailed, and no sanction leaks", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const student = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const admin = await adminToken(current);
  const seeded = await seedThread(current);

  const created = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "message", target_id: seeded.messageId, reason: "harassment" },
    student,
  );
  const reportId = String(created.body?.id);

  const queue = await apiRequest(current, "GET", "/v1/reports", undefined, admin);
  assert.equal((queue.body?.data as unknown[]).length, 1);
  // The queue carries the mentorship of a reported message so the admin page can
  // form the break-glass route; the rest of the key set is unchanged (R1).
  const queueRow = (queue.body?.data as Record<string, unknown>[])[0];
  assert.equal(queueRow.mentorship_id, seeded.mentorshipId);
  assert.deepEqual(Object.keys(queueRow).sort(), [
    "created_at",
    "decision",
    "details",
    "id",
    "mentorship_id",
    "reason",
    "reporter_user_id",
    "resolution_reason",
    "resolved_at",
    "resolved_by_user_id",
    "status",
    "target_id",
    "target_kind",
  ]);

  const resolved = await apiRequest(
    current,
    "POST",
    `/v1/reports/${reportId}/resolve`,
    { decision: "actioned", reason: "Reviewed the thread and acted." },
    admin,
  );
  assert.equal(resolved.status, 200, resolved.text);
  assert.equal(resolved.body?.status, "resolved");

  const second = await apiRequest(
    current,
    "POST",
    `/v1/reports/${reportId}/resolve`,
    { decision: "dismissed", reason: "Second attempt." },
    admin,
  );
  assert.equal(second.status, 409);
  assert.equal(second.body?.code, "REPORT_ALREADY_RESOLVED");

  const audits = await current.client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE action = 'REPORT_RESOLVED'",
  );
  assert.equal(audits.rowCount, 1, "exactly one audit row");

  const emails = await current.client.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM outbox_events WHERE payload->>'template' = 'report-resolved'",
  );
  assert.equal(emails.rowCount, 1);
  assert.equal(emails.rows[0].payload.to, "student@example.com");
  const text = String(emails.rows[0].payload.text);
  assert.ok(!/suspend|suspension|sanction/i.test(text), "the email names no sanction");
  assert.ok(!text.includes("mentor@example.com"), "the email names no other user");
});

test("a suspension stores its end date, revokes sessions, audits, and notifies once", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const admin = await adminToken(current);
  const seeded = await seedThread(current);

  const sessionsBefore = await current.client.query(
    "SELECT id FROM sessions WHERE user_id = $1",
    [seeded.studentId],
  );
  assert.equal(sessionsBefore.rowCount, 1);

  const suspended = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.studentId}/suspend`,
    { reason: "Abusive messages.", end_date: "2026-12-01" },
    admin,
  );
  assert.equal(suspended.status, 200, suspended.text);
  assert.equal(suspended.body?.status, "suspended");
  assert.equal(suspended.body?.suspended_until, "2026-12-01");

  const user = await current.client.query<{ status: string; suspended_until: Date }>(
    "SELECT status, suspended_until FROM users WHERE id = $1",
    [seeded.studentId],
  );
  assert.equal(user.rows[0].status, "SUSPENDED");
  assert.equal(user.rows[0].suspended_until.toISOString().slice(0, 10), "2026-12-01");

  const sessionsAfter = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    seeded.studentId,
  ]);
  assert.equal(sessionsAfter.rowCount, 0, "every session is revoked in the same transaction");

  const audits = await current.client.query<{ reason: string; metadata: Record<string, unknown> }>(
    "SELECT reason, metadata FROM audit_logs WHERE action = 'ACCOUNT_SUSPENDED'",
  );
  assert.equal(audits.rowCount, 1);
  assert.equal(audits.rows[0].reason, "Abusive messages.");
  assert.equal(audits.rows[0].metadata.suspended_until, "2026-12-01");

  const emails = await current.client.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM outbox_events WHERE payload->>'template' = 'account-suspended'",
  );
  assert.equal(emails.rowCount, 1, "one notice, queued once");
  const text = String(emails.rows[0].payload.text);
  assert.match(text, /Abusive messages\./);
  assert.match(text, /2026-12-01/);

  // The suspended account cannot sign in again, and the reason is required.
  const refusedSignIn = await apiRequest(current, "POST", "/v1/auth/sign-in", {
    email: "student@example.com",
    password: "a sufficiently long passphrase",
  });
  assert.equal(refusedSignIn.status, 403);
  assert.equal(refusedSignIn.body?.code, "ACCOUNT_SUSPENDED");

  const missingReason = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.mentorId}/suspend`,
    {},
    admin,
  );
  assert.equal(missingReason.status, 422);
  assert.equal(missingReason.body?.code, "VALIDATION_FAILED");
  const mentor = await current.client.query<{ status: string }>(
    "SELECT status FROM users WHERE id = $1",
    [seeded.mentorId],
  );
  assert.equal(mentor.rows[0].status, "ACTIVE", "a refused suspension changes nothing");
});

test("a report on a user carries no mentorship id", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await signInToken(current, "student@example.com");
  const admin = await adminToken(current, "admin-nomento@example.com");
  // A user target must be an existing account: register one for this test.
  await registerAndVerify(current, "reported-user@example.com");
  const target = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'reported-user@example.com'",
  );

  const created = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "user", target_id: target.rows[0]?.id, reason: "harassment" },
    student,
  );
  assert.equal(created.status, 201, created.text);

  const queue = await apiRequest(current, "GET", "/v1/reports", undefined, admin);
  const row = (queue.body?.data as Record<string, unknown>[])[0];
  assert.equal(row.target_kind, "user");
  assert.equal(row.mentorship_id, null, "a user target has no mentorship");
});
