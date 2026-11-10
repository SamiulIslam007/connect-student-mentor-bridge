import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import type { Database } from "../src/db/database.js";
import { AuthController } from "../src/identity/auth.controller.js";
import {
  DELETED_DISPLAY_NAME,
  DELETED_MESSAGE_BODY,
  type PrivacyService,
  type PrivacyExportDocument,
} from "../src/privacy/privacy.service.js";
import { DrizzlePrivacyService } from "../src/privacy/drizzle-privacy.service.js";
import { PrivacyController } from "../src/privacy/privacy.controller.js";
import { PRIVACY_SERVICE } from "../src/privacy/privacy.tokens.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  TEST_AUTH_SECRET,
  TEST_PASSWORD,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

const CONTROLLERS = [AuthController, PrivacyController];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      {
        provide: PRIVACY_SERVICE,
        useValue: new DrizzlePrivacyService({ database, secret: TEST_AUTH_SECRET }),
      },
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

/** The ledger fixture: a counted outcome with every append-only row behind it. */
async function seedCountedOutcome(
  current: TestApiStack,
  studentEmail: string,
  mentorEmail: string,
): Promise<{ studentId: string; mentorId: string; mentorshipId: string; outcomeId: string }> {
  const { client } = current;
  const student = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    studentEmail,
  ]);
  const mentor = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    mentorEmail,
  ]);
  const studentId = student.rows[0].id;
  const mentorId = mentor.rows[0].id;

  const field = await client.query<{ id: string }>(
    "INSERT INTO fields (name, normalized_slug, created_by_user_id) VALUES ('Privacy field', 'privacy field', $1) RETURNING id",
    [mentorId],
  );
  const fieldId = field.rows[0].id;
  const studentProfile = await client.query<{ id: string }>(
    "INSERT INTO student_profiles (user_id, goals, primary_field_id) VALUES ($1, 'Become an engineer', $2) RETURNING id",
    [studentId, fieldId],
  );
  const mentorProfile = await client.query<{ id: string }>(
    "INSERT INTO mentor_profiles (user_id, primary_field_id, status, onboarding_status, headline, bio, expertise_summary, scope_statement, languages, weekly_capacity) VALUES ($1, $2, 'ACTIVE', 'AFFILIATION_VERIFIED', 'Headline', 'Bio', 'Expertise', 'Scope', '{en}', 2) RETURNING id",
    [mentorId, fieldId],
  );
  const request = await client.query<{ id: string }>(
    "INSERT INTO mentorship_requests (student_profile_id, mentor_profile_id, field_id, question, context_summary, target_outcome, timeframe, expires_at) VALUES ($1, $2, $3, 'Question', 'Context', 'Outcome', 'WITHIN_1_MONTH', now() + interval '2 days') RETURNING id",
    [studentProfile.rows[0].id, mentorProfile.rows[0].id, fieldId],
  );
  const mentorship = await client.query<{ id: string }>(
    "INSERT INTO mentorships (request_id, student_profile_id, mentor_profile_id, field_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [request.rows[0].id, studentProfile.rows[0].id, mentorProfile.rows[0].id, fieldId],
  );
  const mentorshipId = mentorship.rows[0].id;
  const outcome = await client.query<{ id: string }>(
    "INSERT INTO outcomes (mentorship_id, student_profile_id, mentor_profile_id, field_id, outcome_type, description, contribution_claimed, status, counted_basis, mentor_decision_due_at, counted_at) VALUES ($1, $2, $3, $4, 'INTERNSHIP', 'Accepted for an internship', 'HELPED', 'COUNTED', 'MENTOR_CONFIRMED', now() + interval '7 days', now()) RETURNING id",
    [mentorshipId, studentProfile.rows[0].id, mentorProfile.rows[0].id, fieldId],
  );
  const outcomeId = outcome.rows[0].id;

  await client.query(
    "INSERT INTO outcome_events (outcome_id, seq, event_type, actor_user_id, from_status, to_status, request_id) VALUES ($1, 1, 'REPORTED', $2, NULL, 'PENDING_CONFIRMATION', 'seed'), ($1, 2, 'CONFIRMED', $3, 'PENDING_CONFIRMATION', 'CONFIRMED', 'seed')",
    [outcomeId, studentId, mentorId],
  );
  await client.query(
    "INSERT INTO verification_records (outcome_id, kind, decision, attester_user_id, contribution_level, statement) VALUES ($1, 'MENTOR_CONFIRMATION', 'CONFIRMED', $2, 'HELPED', 'Confirmed')",
    [outcomeId, mentorId],
  );
  await client.query(
    "INSERT INTO reputation_events (outcome_id, mentor_profile_id, student_profile_id, field_id, outcome_type, event_type, difficulty_weight, tier_multiplier, contribution_multiplier, pair_factor, points, occurred_at) VALUES ($1, $2, $3, $4, 'INTERNSHIP', 'COUNTED', 1, 1, 1, 1, 1, now())",
    [outcomeId, mentorProfile.rows[0].id, studentProfile.rows[0].id, fieldId],
  );
  await client.query(
    "INSERT INTO field_impact_snapshots (mentor_profile_id, field_id, outcome_type, counted_count, points_total) VALUES ($1, $2, 'INTERNSHIP', 1, 1)",
    [mentorProfile.rows[0].id, fieldId],
  );
  await client.query(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body) VALUES ($1, $2, 'My own private plan')",
    [mentorshipId, studentId],
  );
  await client.query(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body) VALUES ($1, $2, 'Mentor reply stays')",
    [mentorshipId, mentorId],
  );

  return { studentId, mentorId, mentorshipId, outcomeId };
}

/** `to_jsonb` gives a byte-comparable snapshot of an append-only table. */
async function snapshot(current: TestApiStack, table: string): Promise<string> {
  const rows = await current.client.query<{ row: unknown }>(
    `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY t.id`,
  );
  return JSON.stringify(rows.rows);
}

test("the ledger survives a deletion", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  await seedCountedOutcome(current, "student@example.com", "mentor@example.com");

  // `audit_logs` gets exactly one appended entry; every other ledger is untouched.
  const ledgerTables = [
    "outcomes",
    "outcome_events",
    "verification_records",
    "reputation_events",
    "field_impact_snapshots",
    "consent_records",
  ];
  const before = new Map<string, string>();
  for (const table of ledgerTables) {
    before.set(table, await snapshot(current, table));
  }
  const auditBefore = await current.client.query<{ row: Record<string, unknown> }>(
    "SELECT to_jsonb(t) AS row FROM audit_logs t ORDER BY t.id",
  );

  const deleted = await apiRequest(current, "POST", "/v1/privacy/delete", {
    confirm_email: "student@example.com",
  }, token);
  assert.equal(deleted.status, 200, deleted.text);

  for (const table of ledgerTables) {
    assert.equal(await snapshot(current, table), before.get(table), `${table} must be unchanged`);
  }

  const auditAfter = await current.client.query<{ row: Record<string, unknown> }>(
    "SELECT to_jsonb(t) AS row FROM audit_logs t ORDER BY t.id",
  );
  const appended = auditAfter.rows.filter((row) => row.row.action === "ACCOUNT_DELETED");
  assert.equal(appended.length, 1, "exactly one deletion entry is appended");
  const surviving = auditAfter.rows.filter((row) => row.row.action !== "ACCOUNT_DELETED");
  assert.deepEqual(surviving, auditBefore.rows, "every earlier audit entry is unchanged");

  // Every ledger row still resolves to its user through the profile row.
  const join = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM reputation_events r JOIN student_profiles sp ON sp.id = r.student_profile_id JOIN users u ON u.id = sp.user_id",
  );
  assert.equal(join.rows[0].count, "1", "a ledger row still resolves to a user row");
  const events = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM outcome_events e JOIN outcomes o ON o.id = e.outcome_id JOIN student_profiles sp ON sp.id = o.student_profile_id JOIN users u ON u.id = sp.user_id",
  );
  assert.equal(events.rows[0].count, "2", "both events still resolve");

  const user = await current.client.query<{ name: string; email: string; status: string }>(
    "SELECT name, email, status FROM users WHERE name = $1",
    [DELETED_DISPLAY_NAME],
  );
  assert.equal(user.rowCount, 1, "the tombstone keeps the row");
  assert.equal(user.rows[0].status, "ANONYMIZED");
  assert.match(user.rows[0].email, /^[0-9a-f]{64}$/, "the address became a keyed hash");

  const audit = await current.client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE action = 'ACCOUNT_DELETED'",
  );
  assert.equal(audit.rowCount, 1);
});

test("deletion is one transaction: a failure mid-way changes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const seeded = await seedCountedOutcome(current, "student@example.com", "mentor@example.com");

  // The service is injected with a transaction proxy that fails on the first
  // delete, after the user and account updates have already run inside it.
  const failing = new Proxy(current.database.db, {
    get(target, property, receiver) {
      if (property !== "transaction") {
        return Reflect.get(target, property, receiver);
      }
      return async (callback: (tx: Database) => Promise<unknown>) =>
        target.transaction(async (tx) => {
          let failed = false;
          const proxied = new Proxy(tx, {
            get(inner, innerProperty) {
              const value = Reflect.get(inner, innerProperty);
              if (typeof value !== "function") {
                return value;
              }
              if (innerProperty === "delete" && !failed) {
                return () => {
                  failed = true;
                  throw new Error("forced mid-transaction failure");
                };
              }
              return value.bind(inner);
            },
          });
          return callback(proxied as unknown as Database);
        });
    },
  }) as Database;

  const service: PrivacyService = new DrizzlePrivacyService({
    database: failing,
    secret: TEST_AUTH_SECRET,
  });
  await assert.rejects(
    service.deleteAccount({
      userId: seeded.studentId,
      confirmEmail: "student@example.com",
      requestId: "forced-failure",
    }),
    /forced mid-transaction failure/,
  );

  const user = await current.client.query<{ name: string; email: string; status: string }>(
    "SELECT name, email, status FROM users WHERE id = $1",
    [seeded.studentId],
  );
  assert.deepEqual(user.rows[0], {
    name: "Rahim Uddin",
    email: "student@example.com",
    status: "ACTIVE",
  });
  const password = await current.client.query<{ password: string | null }>(
    "SELECT password FROM accounts WHERE user_id = $1",
    [seeded.studentId],
  );
  assert.ok(password.rows[0].password, "the credential is untouched");
  const sessions = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    seeded.studentId,
  ]);
  assert.equal(sessions.rowCount, 1, "the session was not deleted");
});

test("identifiers are erased and the counterpart's content is not", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const seeded = await seedCountedOutcome(current, "student@example.com", "mentor@example.com");

  const deleted = await apiRequest(current, "POST", "/v1/privacy/delete", {
    confirm_email: "Student@Example.com",
  }, token);
  assert.equal(deleted.status, 200, deleted.text);

  const profile = await current.client.query<{ goals: string; languages: string[] }>(
    "SELECT goals, languages FROM student_profiles WHERE user_id = $1",
    [seeded.studentId],
  );
  assert.deepEqual(profile.rows[0], { goals: "", languages: [] });

  const mentor = await current.client.query<{ status: string; headline: string }>(
    "SELECT status, headline FROM mentor_profiles WHERE user_id = $1",
    [seeded.mentorId],
  );
  assert.equal(mentor.rows[0].status, "ACTIVE", "the counterpart's profile is untouched");

  const messages = await current.client.query<{ body: string }>("SELECT body FROM thread_messages");
  assert.deepEqual(
    messages.rows.map((row) => row.body).sort(),
    [DELETED_MESSAGE_BODY, "Mentor reply stays"].sort(),
  );

  const sessions = await current.client.query("SELECT id FROM sessions WHERE user_id = $1", [
    seeded.studentId,
  ]);
  assert.equal(sessions.rowCount, 0, "every session is gone");
});

test("a deleted account cannot sign in, and a second deletion is a no-op", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  const seeded = await seedCountedOutcome(current, "student@example.com", "mentor@example.com");

  const deleted = await apiRequest(current, "POST", "/v1/privacy/delete", {
    confirm_email: "student@example.com",
  }, token);
  assert.equal(deleted.status, 200, deleted.text);

  const signInAgain = await apiRequest(current, "POST", "/v1/auth/sign-in", {
    email: "student@example.com",
    password: TEST_PASSWORD,
  });
  assert.equal(signInAgain.status, 401, "the address no longer resolves to an account");

  const stale = await apiRequest(current, "POST", "/v1/privacy/export", undefined, token);
  assert.equal(stale.status, 401, "the old token authenticates nothing");

  const service = new DrizzlePrivacyService({
    database: current.database.db,
    secret: TEST_AUTH_SECRET,
  });
  const second = await service.deleteAccount({
    userId: seeded.studentId,
    confirmEmail: "student@example.com",
    requestId: "second-delete",
  });
  assert.deepEqual(second, { status: "deleted" });

  const audits = await current.client.query("SELECT id FROM audit_logs WHERE action = 'ACCOUNT_DELETED'");
  assert.equal(audits.rowCount, 1, "no second audit entry");
  const requests = await current.client.query("SELECT id FROM privacy_requests WHERE kind = 'DELETE'");
  assert.equal(requests.rowCount, 1, "no second tracking row");
});

test("the export holds only the caller's rows and no secret", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  await signInToken(current, "mentor@example.com");
  await signInToken(current, "other@example.com");
  const seeded = await seedCountedOutcome(current, "student@example.com", "mentor@example.com");
  const institution = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ('Privacy University', 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
  );
  await current.client.query(
    "INSERT INTO affiliations (user_id, institution_id, kind, level, method, status) VALUES ($1, $2, 'STUDENT', 'LEVEL_1', 'INSTITUTIONAL_EMAIL', 'VERIFIED')",
    [seeded.studentId, institution.rows[0].id],
  );
  await current.client.query(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body) VALUES ($1, (SELECT id FROM users WHERE email = 'other@example.com'), 'Distinctive stranger text')",
    [seeded.mentorshipId],
  );

  const password = await current.client.query<{ password: string | null; id: string }>(
    "SELECT password, id FROM accounts WHERE user_id = $1",
    [seeded.studentId],
  );
  const session = await current.client.query<{ token: string }>(
    "SELECT token FROM sessions WHERE user_id = $1",
    [seeded.studentId],
  );

  const response = await apiRequest(current, "POST", "/v1/privacy/export", undefined, token);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(String(response.headers.get("content-disposition")), /attachment/);

  const document = response.body as unknown as PrivacyExportDocument;
  const serialized = JSON.stringify(document);
  assert.equal(document.export_version, "1");
  assert.equal(document.consent_document_version, "2026-11");
  assert.ok(Array.isArray(document.messages) && (document.messages as unknown[]).length === 1);
  assert.ok((document.outcomes as unknown[]).length === 1, "the caller's own outcome");
  assert.ok((document.affiliations as unknown[]).length === 1);
  assert.ok(!serialized.includes("Distinctive stranger text"), "no other user's message");
  assert.ok(!serialized.includes("other@example.com"), "no other user's address");
  assert.ok(!serialized.includes("mentor@example.com"), "no counterpart address");
  assert.ok(!serialized.includes(String(password.rows[0].password)), "no password hash");
  assert.ok(!serialized.includes(session.rows[0].token), "no session token");
  assert.ok(!serialized.includes("backup_codes"), "no second-factor material");

  const tracking = await current.client.query<{ kind: string; status: string }>(
    "SELECT kind, status FROM privacy_requests WHERE user_id = $1",
    [seeded.studentId],
  );
  assert.deepEqual(tracking.rows, [{ kind: "EXPORT", status: "COMPLETED" }]);
});

test("a suspended, anonymized, or deactivated account cannot export", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await signInToken(current, "student@example.com");
  const user = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'student@example.com'",
  );

  const signedOut = await apiRequest(current, "POST", "/v1/privacy/export");
  assert.equal(signedOut.status, 401);

  for (const status of ["SUSPENDED", "ANONYMIZED", "DEACTIVATED"]) {
    await current.client.query("UPDATE users SET status = $1 WHERE id = $2", [
      status,
      user.rows[0].id,
    ]);
    const refused = await apiRequest(current, "POST", "/v1/privacy/export", undefined, token);
    assert.equal(refused.status, 403, `${status}: ${refused.text}`);
    assert.equal(refused.body?.code, "FORBIDDEN");
  }

  const tracking = await current.client.query("SELECT id FROM privacy_requests");
  assert.equal(tracking.rowCount, 0, "a refused request writes no tracking row");
});
