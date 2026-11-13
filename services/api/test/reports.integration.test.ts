import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { AuthController } from "../src/identity/auth.controller.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { DrizzleReportsService } from "../src/reports/drizzle-reports.service.js";
import { ReportsAdminController } from "../src/reports/admin.controller.js";
import { ReportsController } from "../src/reports/reports.controller.js";
import { REPORTS_SERVICE } from "../src/reports/reports.tokens.js";
import { liftExpiredSuspensions } from "../src/reports/sanction-expiry.js";
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

test("a profile the caller cannot see is refused with 404, including a suspended account", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const student = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const seeded = await seedThread(current);
  const [profile] = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = $1",
      [seeded.mentorId],
    )
  ).rows;

  const visible = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "profile", target_id: profile.id, reason: "spam" },
    student,
  );
  assert.equal(visible.status, 201, visible.text);

  // Discovery hides the profile for an inactive account, so a report must follow
  // the same rule instead of becoming a second way to prove the account exists (D-147).
  await current.client.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [seeded.mentorId]);
  const hidden = await apiRequest(
    current,
    "POST",
    "/v1/reports",
    { target_kind: "profile", target_id: profile.id, reason: "spam" },
    student,
  );
  assert.equal(hidden.status, 404, hidden.text);
  const rows = await current.client.query("SELECT id FROM reports");
  assert.equal(rows.rowCount, 1, "the refused report writes nothing");
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
    "warning_count",
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

test("a warning is on the record, changes no status, and leaves the sessions alone", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "warned@example.com");
  const admin = await adminToken(current);
  const accountId = (
    await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      "warned@example.com",
    ])
  ).rows[0].id;

  const sessionsBefore = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    accountId,
  ]);

  const warned = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${accountId}/warn`,
    { reason: "Two hostile replies in the thread." },
    admin,
  );
  assert.equal(warned.status, 200, warned.text);
  assert.equal(warned.body?.status, "active", "a warning changes no status");
  assert.equal(warned.body?.warning_count, 1);

  const user = await current.client.query<{ status: string; suspended_until: Date | null }>(
    "SELECT status, suspended_until FROM users WHERE id = $1",
    [accountId],
  );
  assert.equal(user.rows[0].status, "ACTIVE");
  assert.equal(user.rows[0].suspended_until, null);

  const sessionsAfter = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    accountId,
  ]);
  assert.equal(sessionsAfter.rowCount, sessionsBefore.rowCount, "no session is touched");

  const audits = await current.client.query<{ reason: string; actor_user_id: string }>(
    "SELECT reason, actor_user_id FROM audit_logs WHERE action = 'ACCOUNT_WARNED' AND object_id = $1",
    [accountId],
  );
  assert.equal(audits.rowCount, 1);
  assert.equal(audits.rows[0].reason, "Two hostile replies in the thread.");

  const emails = await current.client.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM outbox_events WHERE dedupe_key LIKE $1",
    [`email:account-warned:${accountId}:%`],
  );
  assert.equal(emails.rowCount, 1, "one notice is queued");
  const payload = emails.rows[0].payload as { template: string; text: string };
  assert.equal(payload.template, "account-warned");
  assert.ok(String(payload.text).includes("Two hostile replies in the thread."));
  assert.ok(!String(payload.text).includes("warned@example.com"), "the notice names no other account");

  // The warned account has no surface that reports the count: the contract's own
  // account read carries no warning property, and the account projection never
  // adds one (D-139).
  const meContract = readFileSync(
    fileURLToPath(new URL("../../../packages/contracts/openapi.yaml", import.meta.url)),
    "utf8",
  );
  const meStart = meContract.indexOf("    MeResponse:");
  assert.ok(meStart > 0, "MeResponse is in the contract");
  const meEnd = meContract.indexOf("\n    ", meStart + 20);
  const meBlock = meContract.slice(meStart, meEnd);
  assert.ok(!meBlock.includes("warning"), "the account read exposes no warning count");
  assert.ok(token.length > 0);

  const twice = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${accountId}/warn`,
    { reason: "A third hostile reply." },
    admin,
  );
  assert.equal(twice.body?.warning_count, 2, "warnings accumulate");
});

test("a warning refuses a missing reason and a non-admin caller", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const mentor = await signInToken(current, "mentor@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'MENTOR')",
    [
      (
        await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
          "mentor@example.com",
        ])
      ).rows[0].id,
    ],
  );
  const admin = await adminToken(current);
  const target = (
    await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      "mentor@example.com",
    ])
  ).rows[0].id;

  const empty = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${target}/warn`,
    { reason: "   " },
    admin,
  );
  assert.equal(empty.status, 422, empty.text);
  assert.match(String(empty.body?.detail ?? ""), /reason/);

  const asMentor = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${target}/warn`,
    { reason: "Not an admin." },
    mentor,
  );
  assert.equal(asMentor.status, 403, asMentor.text);

  const audit = await current.client.query(
    "SELECT id FROM audit_logs WHERE action = 'ACCOUNT_WARNED'",
  );
  assert.equal(audit.rowCount, 0, "a refused warning writes nothing");
});

test("a refused admin call is audited and an ordinary role refusal is not", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const noFactor = await signInToken(current, "no-factor-admin@example.com");
  const admin = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    ["no-factor-admin@example.com"],
  );
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [admin.rows[0].id],
  );

  const refused = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${admin.rows[0].id}/reinstate`,
    { reason: "No second factor." },
    noFactor,
  );
  assert.equal(refused.status, 403, refused.text);
  assert.equal(refused.body?.code, "MFA_REQUIRED");

  const rows = await current.client.query<{
    actor_user_id: string;
    actor_role: string;
    metadata: Record<string, unknown>;
  }>("SELECT actor_user_id, actor_role, metadata FROM audit_logs WHERE action = 'PERMISSION_DENIED'");
  assert.equal(rows.rowCount, 1, "one row per refused sensitive action");
  assert.equal(rows.rows[0].actor_user_id, admin.rows[0].id);
  assert.equal(rows.rows[0].actor_role, "PLATFORM_ADMIN", "the role the refusal is about");
  assert.equal(rows.rows[0].metadata.required_role, "PLATFORM_ADMIN");
  assert.equal(rows.rows[0].metadata.method, "POST");
  assert.match(String(rows.rows[0].metadata.path), /^\/v1\/admin\/accounts\//);

  // A caller with no admin role is refused before the second factor, and is recorded too.
  const mentor = await signInToken(current, "mentor@example.com");
  const mentorUser = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    ["mentor@example.com"],
  );
  await current.client.query("INSERT INTO role_assignments (user_id, role) VALUES ($1, 'MENTOR')", [
    mentorUser.rows[0].id,
  ]);
  const noRole = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${admin.rows[0].id}/reinstate`,
    { reason: "Not an admin." },
    mentor,
  );
  assert.equal(noRole.status, 403, noRole.text);
  assert.equal(noRole.body?.code, "ROLE_REQUIRED");
  const after = await current.client.query<{ actor_role: string; metadata: Record<string, unknown> }>(
    "SELECT actor_role, metadata FROM audit_logs WHERE action = 'PERMISSION_DENIED' ORDER BY occurred_at",
  );
  assert.equal(after.rowCount, 2, "the second refusal appends its own row");
  assert.equal(after.rows[1].actor_role, "MENTOR", "the highest role the refused caller holds");
});

test("a lift returns a suspended account to active and clears the end date", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const admin = await adminToken(current);
  const seeded = await seedThread(current);

  const suspended = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.studentId}/suspend`,
    { reason: "Abusive messages." },
    admin,
  );
  assert.equal(suspended.status, 200, suspended.text);

  const lifted = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.studentId}/reinstate`,
    { reason: "The report was withdrawn." },
    admin,
  );
  assert.equal(lifted.status, 200, lifted.text);
  assert.equal(lifted.body?.status, "active");
  assert.equal(lifted.body?.suspended_until, null);

  const user = await current.client.query<{ status: string; suspended_until: Date | null }>(
    "SELECT status, suspended_until FROM users WHERE id = $1",
    [seeded.studentId],
  );
  assert.equal(user.rows[0].status, "ACTIVE");
  assert.equal(user.rows[0].suspended_until, null);

  const audit = await current.client.query<{ actor_user_id: string; reason: string }>(
    "SELECT actor_user_id, reason FROM audit_logs WHERE action = 'ACCOUNT_REINSTATED'",
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].reason, "The report was withdrawn.");

  const sessions = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    seeded.studentId,
  ]);
  assert.equal(sessions.rowCount, 0, "a lift creates no session");

  const again = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.studentId}/reinstate`,
    { reason: "Nothing to lift." },
    admin,
  );
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body?.code, "ACCOUNT_NOT_SUSPENDED");
  const after = await current.client.query(
    "SELECT id FROM audit_logs WHERE action = 'ACCOUNT_REINSTATED'",
  );
  assert.equal(after.rowCount, 1, "a refused lift writes no audit row");
});

test("a suspension hides the mentor from the directory and both lifts restore it with no profile write", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const admin = await adminToken(current);
  const seeded = await seedThread(current);

  const directory = new DrizzleProfilesService(current.database.db);
  const listedIds = async (): Promise<string[]> =>
    (await directory.listMentors({ limit: 20 })).cards.map((card) => card.id);

  const [profile] = (
    await current.client.query<{ id: string; row: Record<string, unknown> }>(
      "SELECT id, to_jsonb(t) AS row FROM mentor_profiles t WHERE user_id = $1",
      [seeded.mentorId],
    )
  ).rows;
  assert.ok(profile, "the mentor profile exists");
  const before = profile.row;

  assert.deepEqual(await listedIds(), [profile.id], "an active account is listed");

  const suspended = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.mentorId}/suspend`,
    { reason: "Abusive messages." },
    admin,
  );
  assert.equal(suspended.status, 200, suspended.text);
  assert.deepEqual(await listedIds(), [], "the suspend route hides the card");

  const lifted = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.mentorId}/reinstate`,
    { reason: "The report was withdrawn." },
    admin,
  );
  assert.equal(lifted.status, 200, lifted.text);
  assert.deepEqual(await listedIds(), [profile.id], "the reinstate route restores the card");

  const [afterRoute] = (
    await current.client.query<{ row: Record<string, unknown> }>(
      "SELECT to_jsonb(t) AS row FROM mentor_profiles t WHERE id = $1",
      [profile.id],
    )
  ).rows;
  assert.deepEqual(afterRoute.row, before, "the route lift writes no profile column");

  // The job's own lift, for the scheduled half of the same rule (D-141).
  const resuspended = await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.mentorId}/suspend`,
    { reason: "Second look.", end_date: "2026-01-05" },
    admin,
  );
  assert.equal(resuspended.status, 200, resuspended.text);
  assert.deepEqual(await listedIds(), [], "the second suspension hides the card again");

  const swept = await liftExpiredSuspensions(current.database.db, new Date("2026-11-13T00:00:00.000Z"));
  assert.equal(swept.lifted, 1, "the passed end date is lifted by the job");
  assert.deepEqual(await listedIds(), [profile.id], "the job's lift restores the card");

  const [afterJob] = (
    await current.client.query<{ row: Record<string, unknown> }>(
      "SELECT to_jsonb(t) AS row FROM mentor_profiles t WHERE id = $1",
      [profile.id],
    )
  ).rows;
  assert.deepEqual(afterJob.row, before, "the job's lift writes no profile column either");
});

test("the job lifts a passed end date and never an indefinite suspension", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const admin = await adminToken(current);
  await signInToken(current, "passed@example.com");
  await signInToken(current, "indefinite@example.com");
  await signInToken(current, "future@example.com");

  const id = async (email: string): Promise<string> =>
    (
      await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])
    ).rows[0].id;

  await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${await id("passed@example.com")}/suspend`,
    { reason: "Expired sanction.", end_date: "2026-01-05" },
    admin,
  );
  await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${await id("indefinite@example.com")}/suspend`,
    { reason: "Indefinite sanction." },
    admin,
  );
  await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${await id("future@example.com")}/suspend`,
    { reason: "Later sanction.", end_date: "2030-01-05" },
    admin,
  );

  const first = await liftExpiredSuspensions(current.database.db, new Date("2026-11-13T00:00:00.000Z"));
  assert.equal(first.lifted, 1, "only the passed end date is lifted");
  assert.equal(first.failed, 0);

  const rows = await current.client.query<{ email: string; status: string; suspended_until: Date | null }>(
    "SELECT email, status, suspended_until FROM users WHERE email IN ($1, $2, $3) ORDER BY email",
    ["passed@example.com", "indefinite@example.com", "future@example.com"],
  );
  const byEmail = new Map(rows.rows.map((row) => [row.email, row]));
  assert.equal(byEmail.get("passed@example.com")?.status, "ACTIVE");
  assert.equal(byEmail.get("passed@example.com")?.suspended_until, null);
  assert.equal(byEmail.get("indefinite@example.com")?.status, "SUSPENDED", "no end date is never lifted");
  assert.equal(byEmail.get("future@example.com")?.status, "SUSPENDED", "a future end date waits");

  const reinstated = await current.client.query<{ actor_user_id: string | null; actor_role: string }>(
    "SELECT actor_user_id, actor_role FROM audit_logs WHERE action = 'ACCOUNT_REINSTATED'",
  );
  assert.equal(reinstated.rowCount, 1);
  assert.equal(reinstated.rows[0].actor_user_id, null, "the job is not a person");
  assert.equal(reinstated.rows[0].actor_role, "SYSTEM");

  const notices = await current.client.query(
    "SELECT id FROM outbox_events WHERE dedupe_key LIKE $1",
    [`email:account-reinstated:${await id("passed@example.com")}:%`],
  );
  assert.equal(notices.rowCount, 1, "one notice per lifted account");

  // A second run over the same data changes nothing (idempotent).
  const second = await liftExpiredSuspensions(current.database.db, new Date("2026-11-13T00:00:00.000Z"));
  assert.equal(second.lifted, 0);
  const auditsAfter = await current.client.query(
    "SELECT id FROM audit_logs WHERE action = 'ACCOUNT_REINSTATED'",
  );
  assert.equal(auditsAfter.rowCount, 1, "the second run writes no audit row");
  const noticesAfter = await current.client.query(
    "SELECT id FROM outbox_events WHERE dedupe_key LIKE $1",
    [`email:account-reinstated:${await id("passed@example.com")}:%`],
  );
  assert.equal(noticesAfter.rowCount, 1, "the second run queues no notice");
});

test("a suspension set again after the job's instant is not lifted", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const admin = await adminToken(current);
  const seeded = await seedThread(current);

  // Suspended with an end date the job's instant is past, then re-suspended with
  // a later date before the lift runs: the conditional update must lose.
  await apiRequest(
    current,
    "POST",
    `/v1/admin/accounts/${seeded.studentId}/suspend`,
    { reason: "First sanction.", end_date: "2026-01-05" },
    admin,
  );
  await current.client.query(
    "UPDATE users SET suspended_until = '2030-01-05T00:00:00.000Z' WHERE id = $1",
    [seeded.studentId],
  );

  const result = await liftExpiredSuspensions(current.database.db, new Date("2026-11-13T00:00:00.000Z"));
  assert.equal(result.lifted, 0, "the later end date is not in the past");

  const user = await current.client.query<{ status: string }>(
    "SELECT status FROM users WHERE id = $1",
    [seeded.studentId],
  );
  assert.equal(user.rows[0].status, "SUSPENDED");
});
