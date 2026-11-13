import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AffiliationsController } from "../src/affiliations/affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { DrizzleMentorshipService } from "../src/mentorships/drizzle-mentorship.service.js";
import { MentorshipsController, SessionsController } from "../src/mentorships/mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "../src/mentorships/mentorships.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
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
    SessionsController,
  ];
  const started = await startApiStack({
    controllers,
    requestIdRoutes: controllers,
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
      { provide: REQUESTS_SERVICE, useValue: new DrizzleRequestsService(database) },
      { provide: MENTORSHIP_SERVICE, useValue: new DrizzleMentorshipService(database) },
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

interface ActiveMentor {
  token: string;
  profileId: string;
}

async function activeMentor(
  current: TestApiStack,
  email: string,
  options: { capacity?: number } = {},
): Promise<ActiveMentor> {
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
      weekly_capacity: options.capacity ?? 2,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.equal(
    (await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token)).status,
    200,
  );
  await grantMentorAgreements(current.client, email);
  const enrollment = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    token,
  );
  assert.equal(enrollment.status, 200, enrollment.text);
  const secret = new URL(String(enrollment.body?.totp_uri)).searchParams.get("secret");
  assert.ok(secret);
  const verified = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/verify",
    { code: totpCode(secret) },
    token,
  );
  assert.equal(verified.status, 200, verified.text);
  const id = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )
  ).rows[0].id;
  return { token: String(verified.body?.session_token), profileId: id };
}

async function sendRequest(
  current: TestApiStack,
  studentToken: string,
  mentorProfileId: string,
): Promise<string> {
  const created = await apiRequest(
    current,
    "POST",
    "/v1/requests",
    {
      mentor_id: mentorProfileId,
      question: "How do I prepare for an internship interview?",
      context_summary: "Final-year CSE student with two projects.",
      target_outcome: "Pass a technical interview",
      expected_timeframe: "WITHIN_1_MONTH",
    },
    studentToken,
  );
  assert.equal(created.status, 201, created.text);
  return String(created.body?.id);
}

/** Student + mentor + one accepted request, which is one ACTIVE mentorship. */
async function acceptedPair(current: TestApiStack, suffix = "") {
  const student = await studentWithProfile(current, `student${suffix}@example.com`);
  const mentor = await activeMentor(current, `mentor${suffix}@example.edu.bd`);
  const requestId = await sendRequest(current, student, mentor.profileId);
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${requestId}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  const mentorshipId = String(accepted.body?.mentorship_id);
  assert.match(mentorshipId, /^[0-9a-f-]{36}$/);
  return { student, mentor, requestId, mentorshipId };
}

async function countRows(current: TestApiStack, table: string): Promise<number> {
  const result = await current.client.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

test("accepting a request creates exactly one mentorship with the request's field", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "accept.student@example.com");
  const mentor = await activeMentor(current, "accept.mentor@example.edu.bd");
  const requestId = await sendRequest(current, student, mentor.profileId);

  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${requestId}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(await countRows(current, "mentorships"), 1);

  const row = await current.client.query<{
    status: string;
    request_id: string;
    field_id: string;
    is_paid: boolean;
    started_at: Date | null;
    request_field: string;
  }>(
    `SELECT m.status, m.request_id, m.field_id, m.is_paid, m.started_at, r.field_id AS request_field
       FROM mentorships m JOIN mentorship_requests r ON r.id = m.request_id`,
  );
  assert.equal(row.rows[0]?.status, "ACTIVE");
  assert.equal(row.rows[0]?.request_id, requestId);
  assert.equal(row.rows[0]?.field_id, row.rows[0]?.request_field);
  assert.equal(row.rows[0]?.is_paid, false);
  assert.ok(row.rows[0]?.started_at instanceof Date);
});

test("a retried acceptance answers 409 and keeps one mentorship; a decline creates none", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "retry.student@example.com");
  const mentor = await activeMentor(current, "retry.mentor@example.edu.bd");
  const requestId = await sendRequest(current, student, mentor.profileId);

  assert.equal(
    (await apiRequest(current, "POST", `/v1/requests/${requestId}/accept`, undefined, mentor.token))
      .status,
    200,
  );
  const retried = await apiRequest(
    current,
    "POST",
    `/v1/requests/${requestId}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(retried.status, 409, retried.text);
  assert.equal(retried.body?.code, "REQUEST_INVALID_STATE");
  assert.equal(await countRows(current, "mentorships"), 1);

  const secondStudent = await studentWithProfile(current, "decline.student@example.com");
  const declinedRequest = await sendRequest(current, secondStudent, mentor.profileId);
  const declined = await apiRequest(
    current,
    "POST",
    `/v1/requests/${declinedRequest}/decline`,
    { reason: "Not my field" },
    mentor.token,
  );
  assert.equal(declined.status, 200, declined.text);
  assert.equal(await countRows(current, "mentorships"), 1);
});

test("a failed mentorship insert leaves the request pending and queues no email", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "rollback.student@example.com");
  const mentor = await activeMentor(current, "rollback.mentor@example.edu.bd");
  const requestId = await sendRequest(current, student, mentor.profileId);

  // Pre-inserting the mentorship makes the accept path violate the unique
  // request_id, which is the only way to fail the insert for a real request.
  await current.client.query(
    `INSERT INTO mentorships (request_id, student_profile_id, mentor_profile_id, field_id)
     SELECT id, student_profile_id, mentor_profile_id, field_id FROM mentorship_requests WHERE id = $1`,
    [requestId],
  );
  await current.client.query("DELETE FROM outbox_events");

  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${requestId}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 500, accepted.text);

  const request = await current.client.query<{ status: string }>(
    "SELECT status FROM mentorship_requests WHERE id = $1",
    [requestId],
  );
  assert.equal(request.rows[0]?.status, "PENDING", "the accept transaction rolled back");
  assert.equal(await countRows(current, "outbox_events"), 0, "no decision email was queued");
});

test("only participants read a mentorship; a third account gets 404", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current);
  const third = await studentWithProfile(current, "third@example.com");

  for (const token of [student, mentor.token]) {
    const read = await apiRequest(current, "GET", `/v1/mentorships/${mentorshipId}`, undefined, token);
    assert.equal(read.status, 200, read.text);
    assert.equal(read.body?.status, "active");
    assert.equal(read.body?.is_paid, false);
  }

  const refused = await apiRequest(current, "GET", `/v1/mentorships/${mentorshipId}`, undefined, third);
  assert.equal(refused.status, 404, refused.text);
  assert.equal(refused.body?.code, "NOT_FOUND");
  assert.equal(JSON.stringify(refused.body).includes("How do I prepare"), false);

  const list = await apiRequest(current, "GET", "/v1/mentorships", undefined, third);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body?.data, []);
});

test("the thread is oldest-first, keyset-paginated, and one email per message", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current);

  for (const [token, body] of [
    [student, "First question"],
    [mentor.token, "Second answer"],
    [student, "Third question"],
  ] as const) {
    const posted = await apiRequest(
      current,
      "POST",
      `/v1/mentorships/${mentorshipId}/messages`,
      { body },
      token,
    );
    assert.equal(posted.status, 201, posted.text);
  }

  const firstPage = await apiRequest(
    current,
    "GET",
    `/v1/mentorships/${mentorshipId}/messages?limit=2`,
    undefined,
    mentor.token,
  );
  assert.equal(firstPage.status, 200, firstPage.text);
  const page = firstPage.body as { data: { body: string }[]; next_cursor: string | null };
  assert.deepEqual(
    page.data.map((row) => row.body),
    ["First question", "Second answer"],
  );
  assert.ok(page.next_cursor);

  const lastPage = await apiRequest(
    current,
    "GET",
    `/v1/mentorships/${mentorshipId}/messages?limit=2&cursor=${encodeURIComponent(String(page.next_cursor))}`,
    undefined,
    student,
  );
  const last = lastPage.body as { data: { body: string }[]; next_cursor: string | null };
  assert.deepEqual(
    last.data.map((row) => row.body),
    ["Third question"],
  );
  assert.equal(last.next_cursor, null);

  const events = await current.client.query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM outbox_events WHERE dedupe_key LIKE 'email:thread-message:%'",
  );
  assert.equal(events.rows.length, 3, "one email event per message");
  const emails = await current.client.query<{ payload: { text: string } }>(
    "SELECT payload FROM outbox_events WHERE dedupe_key LIKE 'email:thread-message:%'",
  );
  assert.equal(
    emails.rows.some((row) => row.payload.text.includes("Second answer")),
    false,
    "a notification never carries another message's text",
  );
});

test("a third account cannot read or post, and a bad body is refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorshipId } = await acceptedPair(current, ".codes");
  const third = await studentWithProfile(current, "thread.third@example.com");

  const read = await apiRequest(
    current,
    "GET",
    `/v1/mentorships/${mentorshipId}/messages`,
    undefined,
    third,
  );
  assert.equal(read.status, 404, read.text);
  const posted = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/messages`,
    { body: "Should not exist" },
    third,
  );
  assert.equal(posted.status, 404, posted.text);
  assert.equal(await countRows(current, "thread_messages"), 0);

  for (const body of ["", "   ", "x".repeat(2_001)]) {
    const refused = await apiRequest(
      current,
      "POST",
      `/v1/mentorships/${mentorshipId}/messages`,
      { body },
      student,
    );
    assert.equal(refused.status, 422, `${body.length} characters → ${refused.text}`);
    assert.match(String(refused.body?.detail), /body/);
  }
  assert.equal(await countRows(current, "thread_messages"), 0);

  const edit = await apiRequest(
    current,
    "PUT",
    `/v1/mentorships/${mentorshipId}/messages`,
    { body: "edit" },
    student,
  );
  assert.equal(edit.status, 404, "messages have no update route");
});

test("the agreement is set once and acknowledged per party", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".agreement");

  const saved = await apiRequest(
    current,
    "PUT",
    `/v1/mentorships/${mentorshipId}/agreement`,
    { cadence: "WEEKLY", planned_weeks: 8, goal: "Ship a portfolio project" },
    student,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body?.cadence, "weekly");
  assert.equal(saved.body?.planned_weeks, 8);
  assert.equal(saved.body?.goal, "Ship a portfolio project");

  const unknown = await apiRequest(
    current,
    "PUT",
    `/v1/mentorships/${mentorshipId}/agreement`,
    { cadence: "DAILY" },
    student,
  );
  assert.equal(unknown.status, 422, unknown.text);

  const studentAck = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/agreement/acknowledge`,
    undefined,
    student,
  );
  assert.equal(studentAck.status, 200, studentAck.text);
  assert.equal(studentAck.body?.agreement_acknowledged, false);
  assert.ok(studentAck.body?.student_acknowledged_at);
  assert.equal(studentAck.body?.mentor_acknowledged_at, null);

  const firstAck = String(studentAck.body?.student_acknowledged_at);
  const mentorAck = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/agreement/acknowledge`,
    undefined,
    mentor.token,
  );
  assert.equal(mentorAck.status, 200, mentorAck.text);
  assert.equal(mentorAck.body?.agreement_acknowledged, true);

  const ackedAgain = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/agreement/acknowledge`,
    undefined,
    student,
  );
  assert.equal(
    ackedAgain.body?.student_acknowledged_at,
    firstAck,
    "a later acknowledgement does not overwrite the first",
  );
});

test("a session needs https and a bounded duration", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorshipId } = await acceptedPair(current, ".session");

  const start = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/sessions`,
    { scheduled_start: start, duration_minutes: 45, meeting_url: "https://meet.example.com/abc" },
    student,
  );
  assert.equal(scheduled.status, 201, scheduled.text);
  assert.equal(scheduled.body?.status, "scheduled");
  assert.equal(scheduled.body?.created_by_user_id, (await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = 'student.session@example.com'")).rows[0]?.id);

  for (const overrides of [
    { meeting_url: "http://meet.example.com/abc" },
    { meeting_url: "ftp://meet.example.com/abc" },
    { duration_minutes: 14 },
    { duration_minutes: 241 },
    { scheduled_start: undefined },
  ]) {
    const refused = await apiRequest(
      current,
      "POST",
      `/v1/mentorships/${mentorshipId}/sessions`,
      { scheduled_start: start, duration_minutes: 45, meeting_url: "https://meet.example.com/abc", ...overrides },
      student,
    );
    assert.equal(refused.status, 422, `${JSON.stringify(overrides)} → ${refused.text}`);
  }
  const field = (await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/sessions`,
    { scheduled_start: start, duration_minutes: 45, meeting_url: "http://meet.example.com/abc" },
    student,
  )).body?.detail;
  assert.match(String(field), /meeting_url/);
  assert.equal(await countRows(current, "mentorship_sessions"), 1);
});

test("a session is held only when both confirm, and a held session cannot be cancelled", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".held");

  const created = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/sessions`,
    {
      scheduled_start: new Date(Date.now() + 3_600_000).toISOString(),
      duration_minutes: 60,
      meeting_url: "https://meet.example.com/held",
    },
    mentor.token,
  );
  assert.equal(created.status, 201, created.text);
  const sessionId = String(created.body?.id);

  const one = await apiRequest(current, "POST", `/v1/sessions/${sessionId}/confirm-held`, undefined, student);
  assert.equal(one.status, 200, one.text);
  assert.equal(one.body?.status, "scheduled");
  assert.ok(one.body?.student_confirmed_held_at);
  assert.equal(one.body?.mentor_confirmed_held_at, null);

  const both = await apiRequest(current, "POST", `/v1/sessions/${sessionId}/confirm-held`, undefined, mentor.token);
  assert.equal(both.status, 200, both.text);
  assert.equal(both.body?.status, "held");

  const cancelled = await apiRequest(
    current,
    "POST",
    `/v1/sessions/${sessionId}/cancel`,
    { reason: "Already happened" },
    student,
  );
  assert.equal(cancelled.status, 409, cancelled.text);
  assert.equal(cancelled.body?.code, "MENTORSHIP_INVALID_STATE");
});

test("either participant cancels a scheduled session with a reason", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".cancel");

  const created = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/sessions`,
    {
      scheduled_start: new Date(Date.now() + 3_600_000).toISOString(),
      duration_minutes: 30,
      meeting_url: "https://meet.example.com/cancel",
    },
    student,
  );
  const sessionId = String(created.body?.id);

  const noReason = await apiRequest(
    current,
    "POST",
    `/v1/sessions/${sessionId}/cancel`,
    { reason: " " },
    mentor.token,
  );
  assert.equal(noReason.status, 422, noReason.text);

  const cancelled = await apiRequest(
    current,
    "POST",
    `/v1/sessions/${sessionId}/cancel`,
    { reason: "Mentor unavailable" },
    mentor.token,
  );
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.body?.status, "cancelled");
  assert.equal(cancelled.body?.cancel_reason, "Mentor unavailable");

  const confirmed = await apiRequest(
    current,
    "POST",
    `/v1/sessions/${sessionId}/confirm-held`,
    undefined,
    student,
  );
  assert.equal(confirmed.status, 409, "a cancelled session accepts no confirmation");
});

test("a mentorship is completed once and a third account gets 404", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorshipId } = await acceptedPair(current, ".complete");
  const third = await studentWithProfile(current, "complete.third@example.com");

  const refused = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/complete`,
    undefined,
    third,
  );
  assert.equal(refused.status, 404, refused.text);

  const completed = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/complete`,
    undefined,
    student,
  );
  assert.equal(completed.status, 200, completed.text);
  assert.equal(completed.body?.status, "completed");
  assert.ok(completed.body?.ended_at);

  const again = await apiRequest(
    current,
    "POST",
    `/v1/mentorships/${mentorshipId}/complete`,
    undefined,
    student,
  );
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body?.code, "MENTORSHIP_INVALID_STATE");
});
