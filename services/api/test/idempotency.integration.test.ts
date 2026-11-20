import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { canonicalJson, idempotencyKeyViolation } from "@connect/domain";

import { AffiliationsController } from "../src/affiliations/affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { OutcomesController } from "../src/outcomes/outcomes.controller.js";
import { DrizzleOutcomeService } from "../src/outcomes/drizzle-outcome.service.js";
import { OUTCOME_SERVICE } from "../src/outcomes/outcomes.tokens.js";
import { beginKey, sweepExpired } from "../src/platform/idempotency/store.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { DrizzleMentorshipService } from "../src/mentorships/drizzle-mentorship.service.js";
import { MentorshipsController } from "../src/mentorships/mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "../src/mentorships/mentorships.tokens.js";
import { DrizzleRequestsService } from "../src/requests/drizzle-requests.service.js";
import { RequestsController } from "../src/requests/requests.controller.js";
import { REQUESTS_SERVICE } from "../src/requests/requests.tokens.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  TEST_PASSWORD,
  type TestApiStack,
} from "./support/api-stack.js";
import { grantMentorAgreements } from "./support/agreements.js";
import { truncateAll } from "./support/database.js";

/**
 * SEC-API-7 on the three keyed writes: the message post, the outcome report and
 * the request creation. The header is optional, a repeat replays, a reused key
 * with a different body is refused, a stale intent frees its key, and nothing is
 * stored when the header is absent.
 */

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const controllers = [
    AuthController,
    MeController,
    MeRolesController,
    ProfilesController,
    AffiliationsController,
    RequestsController,
    MentorshipsController,
    OutcomesController,
  ];
  const started = await startApiStack({
    controllers,
    requestIdRoutes: controllers,
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
      { provide: REQUESTS_SERVICE, useValue: new DrizzleRequestsService(database) },
      { provide: MENTORSHIP_SERVICE, useValue: new DrizzleMentorshipService(database) },
      { provide: OUTCOME_SERVICE, useValue: new DrizzleOutcomeService(database) },
    ],
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

beforeEach(async () => {
  if (!stack) return;
  await truncateAll(stack.client);
  await stack.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");
  await stack.client.query("DELETE FROM outbox_events");
  await stack.client.query(
    "INSERT INTO institutions (id, name, kind, country_code, status) VALUES ('11111111-1111-1111-1111-111111111111', 'Test University', 'UNIVERSITY', 'BD', 'ACTIVE')",
  );
  await stack.client.query(
    "INSERT INTO institution_domains (institution_id, domain) VALUES ('11111111-1111-1111-1111-111111111111', 'example.edu.bd')",
  );
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

function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  const counter = Math.floor(Date.now() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

async function tokenFor(current: TestApiStack, email: string): Promise<string> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  return String(signedIn.body?.session_token);
}

async function studentWithProfile(current: TestApiStack, email: string): Promise<string> {
  const token = await tokenFor(current, email);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { goals: "Find an internship", primary_field: "Engineering" },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  return token;
}

async function activeMentor(current: TestApiStack, email: string): Promise<{ token: string; profileId: string }> {
  const token = await tokenFor(current, email);
  assert.equal((await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token)).status, 200);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Mentor",
      bio: "Bio",
      expertise_summary: "Summary",
      scope_statement: "Scope",
      primary_field: "Engineering",
      weekly_capacity: 2,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.equal(
    (await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token)).status,
    200,
  );
  await grantMentorAgreements(current.client, email);
  const enrollment = await apiRequest(current, "POST", "/v1/auth/mfa/enroll", { password: TEST_PASSWORD }, token);
  assert.equal(enrollment.status, 200, enrollment.text);
  const secret = new URL(String(enrollment.body?.totp_uri)).searchParams.get("secret");
  assert.ok(secret);
  const verified = await apiRequest(current, "POST", "/v1/auth/mfa/verify", { code: totpCode(secret) }, token);
  assert.equal(verified.status, 200, verified.text);
  const id = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )
  ).rows[0]?.id;
  assert.ok(id);
  return { token: String(verified.body?.session_token), profileId: id };
}

/** A request accepted into a mentorship, which the message and outcome routes need. */
async function setupMentorship(
  current: TestApiStack,
): Promise<{ studentToken: string; mentorToken: string; mentorshipId: string }> {
  const studentToken = await studentWithProfile(current, "student@example.com");
  const mentor = await activeMentor(current, "mentor@example.edu.bd");
  const created = await apiRequest(
    current,
    "POST",
    "/v1/requests",
    {
      mentor_id: mentor.profileId,
      question: "How do I prepare for an internship interview?",
      context_summary: "Final-year CSE student with two projects.",
      target_outcome: "Pass a technical interview",
      expected_timeframe: "WITHIN_1_MONTH",
    },
    studentToken,
  );
  assert.equal(created.status, 201, created.text);
  assert.ok(created.body?.id, `the created request must carry its id: ${created.text}`);
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${String(created.body?.id)}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  const mentorship = await current.client.query<{ id: string }>(
    "SELECT id FROM mentorships WHERE request_id = $1",
    [created.body?.id],
  );
  const mentorshipId = mentorship.rows[0]?.id;
  assert.ok(mentorshipId);
  return { studentToken, mentorToken: mentor.token, mentorshipId };
}

function digestOf(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function messageBody(text: string): Record<string, unknown> {
  return { body: text };
}

test("a first keyed message writes once, and a repeat replays the same response", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const body = messageBody("Sending my CV tonight.");
  const key = { "Idempotency-Key": "message-key-000001" };
  const eventsBefore = (await current.client.query("SELECT id FROM outbox_events")).rowCount ?? 0;

  const first = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    key,
  );
  assert.equal(first.status, 201, first.text);

  const second = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    key,
  );
  assert.equal(second.status, 201, second.text);
  assert.deepEqual(second.body, first.body);

  const rows = await current.client.query("SELECT id FROM thread_messages");
  assert.equal(rows.rowCount, 1, "a replay writes no second message");
  const events = await current.client.query("SELECT id FROM outbox_events");
  assert.equal((events.rowCount ?? 0) - eventsBefore, 1, "exactly one message email is queued, once");
});

test("the same key with a different body is refused and changes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const key = { "Idempotency-Key": "message-key-000002" };

  const first = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("First body"),
    fixture.studentToken,
    key,
  );
  assert.equal(first.status, 201, first.text);

  const second = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("A different body"),
    fixture.studentToken,
    key,
  );
  assert.equal(second.status, 409, second.text);
  assert.equal(second.body?.code, "IDEMPOTENCY_KEY_REUSED");

  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 1);
  const stored = await current.client.query<{ response_body: unknown }>(
    "SELECT response_body FROM idempotency_keys",
  );
  assert.equal(stored.rowCount, 1);
  assert.deepEqual(stored.rows[0]?.response_body, first.body);
});

test("a key belongs to its caller, and a missing header stores nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const key = { "Idempotency-Key": "shared-key-000003" };

  const student = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("From the student"),
    fixture.studentToken,
    key,
  );
  assert.equal(student.status, 201, student.text);
  const mentor = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("From the student"),
    fixture.mentorToken,
    key,
  );
  assert.equal(mentor.status, 201, mentor.text);
  assert.notEqual(mentor.body?.id, student.body?.id);
  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 2);

  const unkeyed = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("No key here"),
    fixture.studentToken,
  );
  assert.equal(unkeyed.status, 201, unkeyed.text);
  const stored = await current.client.query("SELECT id FROM idempotency_keys");
  assert.equal(stored.rowCount, 2, "only the two keyed calls stored a record");
});

test("a malformed key is a 422 before the store and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);

  for (const key of ["short", "bad key with spaces", `${"x".repeat(129)}`]) {
    assert.notEqual(idempotencyKeyViolation(key), null);
    const refused = await apiRequest(
      current,
      "POST",
      `/v1/mentorships/${fixture.mentorshipId}/messages`,
      messageBody("Refused"),
      fixture.studentToken,
      { "Idempotency-Key": key },
    );
    assert.equal(refused.status, 422, `${key}: ${refused.text}`);
    assert.equal(refused.body?.code, "IDEMPOTENCY_KEY_INVALID");
  }
  assert.equal((await current.client.query("SELECT id FROM idempotency_keys")).rowCount, 0);
  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 0);
});

test("an unfinished key answers 409 and a swept one performs a fresh write", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const body = messageBody("Retried after a crash");
  const key = "message-key-000004";
  const studentId = (
    await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      "student@example.com",
    ])
  ).rows[0]?.id;
  assert.ok(studentId);

  const begun = await beginKey(current.database.db, {
    actorUserId: studentId,
    operation: "message.create",
    key,
    digest: digestOf(body),
    now: new Date(),
  });
  assert.equal(begun.kind, "new");

  const refused = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    { "Idempotency-Key": key },
  );
  assert.equal(refused.status, 409, refused.text);
  assert.equal(refused.body?.code, "IDEMPOTENCY_IN_PROGRESS");
  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 0);

  // Past the five-minute intent window the sweep frees the key.
  const swept = await sweepExpired(current.database.db, {
    batch: 100,
    now: new Date(Date.now() + 6 * 60 * 1000),
  });
  assert.equal(swept, 1);

  const afterSweep = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    { "Idempotency-Key": key },
  );
  assert.equal(afterSweep.status, 201, afterSweep.text);
  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 1);
});

test("the sweep deletes an expired record and leaves a young one replaying", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const key = { "Idempotency-Key": "message-key-000005" };
  const body = messageBody("Swept later");

  const first = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    key,
  );
  assert.equal(first.status, 201, first.text);

  const young = await sweepExpired(current.database.db, { batch: 100, now: new Date(Date.now() + 60 * 1000) });
  assert.equal(young, 0, "a young completed record survives");
  const replay = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    key,
  );
  assert.equal(replay.status, 201, replay.text);
  assert.deepEqual(replay.body, first.body);

  const old = await sweepExpired(current.database.db, {
    batch: 100,
    now: new Date(Date.now() + 25 * 60 * 60 * 1000),
  });
  assert.equal(old, 1);
  const fresh = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    body,
    fixture.studentToken,
    key,
  );
  assert.equal(fresh.status, 201, fresh.text);
  assert.equal((await current.client.query("SELECT id FROM thread_messages")).rowCount, 2);
});

test("the request route replays and refuses a reused key", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const studentToken = await studentWithProfile(current, "requester@example.com");
  const mentor = await activeMentor(current, "mentor2@example.edu.bd");
  const body = {
    mentor_id: mentor.profileId,
    question: "How do I prepare for an internship interview?",
    context_summary: "Final-year CSE student with two projects.",
    target_outcome: "Pass a technical interview",
    expected_timeframe: "WITHIN_1_MONTH",
  };
  const key = { "Idempotency-Key": "request-key-000006" };

  const first = await apiRequest(current, "POST", "/v1/requests", body, studentToken, key);
  assert.equal(first.status, 201, first.text);
  const second = await apiRequest(current, "POST", "/v1/requests", body, studentToken, key);
  assert.equal(second.status, 201, second.text);
  assert.deepEqual(second.body, first.body);
  assert.equal((await current.client.query("SELECT id FROM mentorship_requests")).rowCount, 1);

  const reused = await apiRequest(
    current,
    "POST",
    "/v1/requests",
    { ...body, question: "A different question" },
    studentToken,
    key,
  );
  assert.equal(reused.status, 409, reused.text);
  assert.equal(reused.body?.code, "IDEMPOTENCY_KEY_REUSED");
});

test("the outcome route replays and keeps one row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const body = {
    mentorship_id: fixture.mentorshipId,
    outcome_type: "SKILL_MILESTONE",
    description: "Shipped a small feature with the mentor's guidance.",
    contribution_claimed: "HELPED",
  };
  const key = { "Idempotency-Key": "outcome-key-000007" };

  const first = await apiRequest(current, "POST", "/v1/outcomes", body, fixture.studentToken, key);
  assert.equal(first.status, 201, first.text);
  const second = await apiRequest(current, "POST", "/v1/outcomes", body, fixture.studentToken, key);
  assert.equal(second.status, 201, second.text);
  assert.deepEqual(second.body, first.body);
  assert.equal((await current.client.query("SELECT id FROM outcomes")).rowCount, 1);

  const reused = await apiRequest(
    current,
    "POST",
    "/v1/outcomes",
    { ...body, description: "A different description" },
    fixture.studentToken,
    key,
  );
  assert.equal(reused.status, 409, reused.text);
});

test("a unique violation yields one row and one documented answer", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const studentId = (
    await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      "student@example.com",
    ])
  ).rows[0]?.id;
  assert.ok(studentId);

  const input = {
    actorUserId: studentId,
    operation: "message.create",
    key: "race-key-000008",
    digest: digestOf(messageBody("race")),
  };
  const [left, right] = await Promise.all([
    beginKey(current.database.db, input),
    beginKey(current.database.db, input),
  ]);
  assert.deepEqual([left.kind, right.kind].sort(), ["existing", "new"]);
  assert.equal((await current.client.query("SELECT id FROM idempotency_keys")).rowCount, 1);

  const replay = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("race"),
    fixture.studentToken,
    { "Idempotency-Key": input.key },
  );
  assert.equal(replay.status, 409, replay.text);
  assert.equal(replay.body?.code, "IDEMPOTENCY_IN_PROGRESS");
});

test("a handler failure leaves the intent row unfinished", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await setupMentorship(current);
  const key = { "Idempotency-Key": "message-key-000009" };

  // An empty body is refused by the service (422), which is the same non-2xx
  // branch a 5xx takes: the response is never stored, so the intent expires.
  const refused = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    { body: "" },
    fixture.studentToken,
    key,
  );
  assert.equal(refused.status, 422, refused.text);

  const stored = await current.client.query<{ status: string }>(
    "SELECT status FROM idempotency_keys",
  );
  assert.deepEqual(stored.rows.map((row) => row.status), ["IN_PROGRESS"]);

  const swept = await sweepExpired(current.database.db, {
    batch: 10,
    now: new Date(Date.now() + 6 * 60 * 1000),
  });
  assert.equal(swept, 1);

  const retried = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${fixture.mentorshipId}/messages`,
    messageBody("Second attempt"),
    fixture.studentToken,
    key,
  );
  assert.equal(retried.status, 201, retried.text);
});
