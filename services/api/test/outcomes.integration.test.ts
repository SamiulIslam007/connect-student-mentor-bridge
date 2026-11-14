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
import { DrizzleOutcomeService } from "../src/outcomes/drizzle-outcome.service.js";
import { sweepOutcomes } from "../src/outcomes/outcome-sweeper.js";
import { OutcomesController } from "../src/outcomes/outcomes.controller.js";
import { OUTCOME_SERVICE } from "../src/outcomes/outcomes.tokens.js";
import { ReviewQueueController } from "../src/outcomes/review-queue.controller.js";
import { countDueOutcomes } from "../src/reputation/counting-job.js";
import { DrizzleReputationService } from "../src/reputation/drizzle-reputation.service.js";
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
    OutcomesController,
    ReviewQueueController,
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

async function activeMentor(current: TestApiStack, email: string) {
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
  const enrollment = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    token,
  );
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

async function acceptedPair(current: TestApiStack, suffix = "") {
  const student = await studentWithProfile(current, `student${suffix}@example.com`);
  const mentor = await activeMentor(current, `mentor${suffix}@example.edu.bd`);
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
    student,
  );
  assert.equal(created.status, 201, created.text);
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${created.body?.id}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  return { student, mentor, mentorshipId: String(accepted.body?.mentorship_id) };
}

function reportBody(mentorshipId: string, overrides: Record<string, unknown> = {}) {
  return {
    mentorship_id: mentorshipId,
    outcome_type: "INTERNSHIP",
    title: "Summer internship",
    description: "I received an internship offer after the mock interviews.",
    contribution_claimed: "DIRECTLY_ENABLED",
    ...overrides,
  };
}

async function report(current: TestApiStack, token: string, body: Record<string, unknown>) {
  return await apiRequest(current, "POST", "/v1/outcomes", body, token);
}

async function countRows(current: TestApiStack, table: string): Promise<number> {
  const result = await current.client.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

test("a report is pending with a seven-day deadline, one event, and one email", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorshipId } = await acceptedPair(current);

  const refusedExtras = await report(
    current,
    student,
    reportBody(mentorshipId, { field_id: "ignored", student_id: "someone-else" }),
  );
  assert.equal(refusedExtras.status, 422, refusedExtras.text);
  assert.equal(refusedExtras.body?.code, "VALIDATION_FAILED");
  assert.match(String(refusedExtras.body?.detail), /unknown property: /);

  const created = await report(current, student, reportBody(mentorshipId));
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.status, "pending_confirmation");
  assert.equal(created.body?.contribution_claimed, "directly_enabled");
  const days =
    (new Date(String(created.body?.mentor_decision_due_at)).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days < 7.1, `seven days out (got ${days})`);

  const field = await current.client.query<{ same: boolean }>(
    "SELECT o.field_id = m.field_id AS same FROM outcomes o JOIN mentorships m ON m.id = o.mentorship_id",
  );
  assert.equal(field.rows[0]?.same, true, "the field comes from the mentorship");

  const events = await current.client.query<{ seq: number; event_type: string }>(
    "SELECT seq, event_type FROM outcome_events ORDER BY seq",
  );
  assert.deepEqual(events.rows, [{ seq: 1, event_type: "REPORTED" }]);
  const emails = await current.client.query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM outbox_events WHERE dedupe_key LIKE 'email:outcome-reported:%'",
  );
  assert.deepEqual(
    emails.rows.map((row) => row.dedupe_key),
    [`email:outcome-reported:${created.body?.id}`],
    "one email to the mentor is queued",
  );
});

test("a report is refused for a missing description, an unknown type, or a non-student", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".report-guards");
  const third = await studentWithProfile(current, "outcome.third@example.com");

  for (const overrides of [
    { description: "  " },
    { description: "x".repeat(2_001) },
    { outcome_type: "PROMOTION" },
    { contribution_claimed: "TOTAL" },
  ]) {
    const refused = await report(current, student, reportBody(mentorshipId, overrides));
    assert.equal(refused.status, 422, `${JSON.stringify(overrides)} → ${refused.text}`);
  }
  assert.equal(await countRows(current, "outcomes"), 0);

  const mentorReport = await report(current, mentor.token, reportBody(mentorshipId));
  assert.equal(mentorReport.status, 404, "only the student reports");
  const thirdReport = await report(current, third, reportBody(mentorshipId));
  assert.equal(thirdReport.status, 404, "a third account learns nothing");
  assert.equal(await countRows(current, "outcomes"), 0);
});

test("the mentor confirms the fact and the contribution, and no counted state exists", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".confirm");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);

  const confirmed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    mentor.token,
  );
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.equal(confirmed.body?.status, "confirmed");
  assert.equal(confirmed.body?.contribution_claimed, "directly_enabled");
  assert.equal(confirmed.body?.contribution_confirmed, "helped");
  assert.equal(confirmed.body?.counted_basis, null, "counting belongs to the next change");

  const cooling =
    (new Date(String(confirmed.body?.cooling_ends_at)).getTime() -
      new Date(String(confirmed.body?.confirmed_at)).getTime()) /
    86_400_000;
  assert.equal(Math.round(cooling), 14, "the configured cooling period is applied");

  const records = await current.client.query<{ kind: string; decision: string }>(
    "SELECT kind, decision FROM verification_records",
  );
  assert.deepEqual(records.rows, [{ kind: "MENTOR_CONFIRMATION", decision: "CONFIRMED" }]);

  const again = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    mentor.token,
  );
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body?.code, "OUTCOME_INVALID_STATE");

  const byStudent = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    student,
  );
  assert.equal(byStudent.status, 404, "the student cannot confirm");

  const disputedAfter = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/dispute`,
    { reason: "Changed my mind" },
    mentor.token,
  );
  assert.equal(disputedAfter.status, 409, "a dispute applies only while pending");
  assert.equal(disputedAfter.body?.code, "OUTCOME_INVALID_STATE");

  const counted = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/count`,
    undefined,
    mentor.token,
  );
  assert.equal(counted.status, 404, "no route can count an outcome");
});

test("a dispute and a declared conflict both open platform review", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".dispute");

  const first = await report(current, student, reportBody(mentorshipId));
  const disputed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${first.body?.id}/dispute`,
    { reason: "This internship was arranged by the university." },
    mentor.token,
  );
  assert.equal(disputed.status, 200, disputed.text);
  assert.equal(disputed.body?.status, "in_platform_review");
  const noReason = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${first.body?.id}/dispute`,
    { reason: "  " },
    mentor.token,
  );
  assert.equal(noReason.status, 422);

  const second = await report(current, student, reportBody(mentorshipId, { title: "Second" }));
  const conflict = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${second.body?.id}/confirm`,
    { coi_declaration: { relationship: "FAMILY" } },
    mentor.token,
  );
  assert.equal(conflict.status, 200, conflict.text);
  assert.equal(conflict.body?.status, "in_platform_review");
  assert.equal(conflict.body?.coi_declared, true);
  assert.equal(conflict.body?.confirmed_at, null, "no confirmation is stored");

  const records = await current.client.query<{ kind: string }>(
    "SELECT kind FROM verification_records ORDER BY created_at",
  );
  assert.deepEqual(
    records.rows.map((row) => row.kind),
    ["MENTOR_DISPUTE", "CONFLICT_OF_INTEREST"],
  );
});

test("the student withdraws from each open state, never from a closed one", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".withdraw");

  const pending = await report(current, student, reportBody(mentorshipId));
  const confirmedOutcome = await report(current, student, reportBody(mentorshipId, { title: "B" }));
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${confirmedOutcome.body?.id}/confirm`,
    { contribution_level_confirmed: "MINOR" },
    mentor.token,
  );
  const reviewOutcome = await report(current, student, reportBody(mentorshipId, { title: "C" }));
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${reviewOutcome.body?.id}/dispute`,
    { reason: "Not this mentor's doing" },
    mentor.token,
  );

  for (const id of [pending.body?.id, confirmedOutcome.body?.id, reviewOutcome.body?.id]) {
    const withdrawn = await apiRequest(current, "POST", `/v1/outcomes/${id}/withdraw`, undefined, student);
    assert.equal(withdrawn.status, 200, withdrawn.text);
    assert.equal(withdrawn.body?.status, "withdrawn");
  }

  const again = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${pending.body?.id}/withdraw`,
    undefined,
    student,
  );
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body?.code, "OUTCOME_INVALID_STATE");

  const mentorWithdraw = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${confirmedOutcome.body?.id}/withdraw`,
    undefined,
    mentor.token,
  );
  assert.equal(mentorWithdraw.status, 404, "the mentor cannot withdraw");
});

test("the event sequence is gap-free and every transition is audited", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".seq");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "DIRECTLY_ENABLED" },
    mentor.token,
  );
  await apiRequest(current, "POST", `/v1/outcomes/${outcomeId}/withdraw`, undefined, student);

  const events = await current.client.query<{ seq: number; event_type: string; from_status: string | null; to_status: string }>(
    "SELECT seq, event_type, from_status, to_status FROM outcome_events WHERE outcome_id = $1 ORDER BY seq",
    [outcomeId],
  );
  assert.deepEqual(events.rows, [
    { seq: 1, event_type: "REPORTED", from_status: null, to_status: "PENDING_CONFIRMATION" },
    { seq: 2, event_type: "CONFIRMED", from_status: "PENDING_CONFIRMATION", to_status: "CONFIRMED" },
    { seq: 3, event_type: "WITHDRAWN", from_status: "CONFIRMED", to_status: "WITHDRAWN" },
  ]);

  const audits = await current.client.query<{ action: string; object_id: string }>(
    "SELECT action, object_id FROM audit_logs WHERE object_type = 'outcomes' AND object_id = $1 ORDER BY occurred_at",
    [outcomeId],
  );
  assert.deepEqual(
    audits.rows.map((row) => row.action),
    ["OUTCOME_REPORTED", "OUTCOME_CONFIRMED", "OUTCOME_WITHDRAWN"],
  );
});

test("the sweeper reminds at day 3 and day 5 once, then escalates at day 7", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorshipId } = await acceptedPair(current, ".sweep");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);

  await sweepOutcomes(current.database.db);
  assert.equal(
    (await current.client.query("SELECT id FROM outcome_events WHERE event_type::text LIKE 'REMINDER%'"))
      .rowCount,
    0,
    "nothing is due on day 0",
  );

  // Move the report back four days: day 3 is due, day 5 is not.
  await current.client.query(
    "UPDATE outcomes SET created_at = now() - interval '4 days', mentor_decision_due_at = now() + interval '3 days' WHERE id = $1",
    [outcomeId],
  );
  await sweepOutcomes(current.database.db);
  const first = await current.client.query<{ event_type: string }>(
    "SELECT event_type::text AS event_type FROM outcome_events WHERE outcome_id = $1 AND event_type::text LIKE 'REMINDER%'",
    [outcomeId],
  );
  assert.deepEqual(first.rows, [{ event_type: "REMINDER_D3_SENT" }]);
  const emails = await current.client.query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM outbox_events WHERE dedupe_key LIKE 'email:outcome-reminder%'",
  );
  assert.equal(emails.rows.length, 1, "one email per reminder");

  await sweepOutcomes(current.database.db);
  assert.equal(
    (
      await current.client.query(
        "SELECT id FROM outcome_events WHERE event_type = 'REMINDER_D3_SENT'::outcome_event_type",
      )
    ).rowCount,
    1,
    "a second run writes no second day-3 reminder",
  );

  // Day 7: no decision, so the outcome escalates.
  await current.client.query(
    "UPDATE outcomes SET mentor_decision_due_at = now() - interval '1 minute' WHERE id = $1",
    [outcomeId],
  );
  const result = await sweepOutcomes(current.database.db);
  assert.equal(result.escalated, 1);
  const escalated = await current.client.query<{ status: string }>(
    "SELECT status FROM outcomes WHERE id = $1",
    [outcomeId],
  );
  assert.equal(escalated.rows[0]?.status, "IN_PLATFORM_REVIEW");
  assert.equal(
    (
      await current.client.query(
        "SELECT id FROM outcome_events WHERE event_type = 'ESCALATED_D7'::outcome_event_type",
      )
    ).rowCount,
    1,
  );

  const again = await sweepOutcomes(current.database.db);
  assert.equal(again.escalated, 0, "a decided outcome is untouched");
});

test("the sweeper leaves a confirmed outcome alone", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".sweep-confirmed");
  const created = await report(current, student, reportBody(mentorshipId));
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${created.body?.id}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    mentor.token,
  );
  await current.client.query(
    "UPDATE outcomes SET created_at = now() - interval '9 days', mentor_decision_due_at = now() - interval '2 days'",
  );
  const result = await sweepOutcomes(current.database.db);
  assert.deepEqual(result, { reminded: 0, escalated: 0 });
  const row = await current.client.query<{ status: string }>("SELECT status FROM outcomes");
  assert.equal(row.rows[0]?.status, "CONFIRMED");
});

test("a participant reads the outcome and a third account gets 404", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".read");
  const created = await report(current, student, reportBody(mentorshipId));
  const third = await studentWithProfile(current, "outcome.read.third@example.com");

  for (const token of [student, mentor.token]) {
    const read = await apiRequest(current, "GET", `/v1/outcomes/${created.body?.id}`, undefined, token);
    assert.equal(read.status, 200, read.text);
  }
  const refused = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${created.body?.id}`,
    undefined,
    third,
  );
  assert.equal(refused.status, 404, refused.text);

  const list = await apiRequest(
    current,
    "GET",
    `/v1/outcomes?mentorship_id=${mentorshipId}`,
    undefined,
    mentor.token,
  );
  assert.equal(list.status, 200);
  assert.equal((list.body?.data as unknown[]).length, 1);
});

async function platformReviewer(
  current: TestApiStack,
  email = "reviewer@example.com",
  withMfa = true,
): Promise<string> {
  const token = await tokenFor(current, email);
  const user = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  assert.ok(user.rows[0]);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [user.rows[0].id],
  );
  if (!withMfa) {
    return token;
  }
  const enrollment = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    token,
  );
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
  return String(verified.body?.session_token);
}

test("a disputed outcome is queued and a valid decision counts it as platform-decided", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".review");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  const disputed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/dispute`,
    { reason: "The internship was not completed." },
    mentor.token,
  );
  assert.equal(disputed.status, 200, disputed.text);

  const reviewer = await platformReviewer(current);
  const queue = await apiRequest(current, "GET", "/v1/review-queue", undefined, reviewer);
  assert.equal(queue.status, 200, queue.text);
  const entry = (queue.body?.data as { id: string; case_kind: string; reason: string }[]).find(
    (row) => row.id === outcomeId,
  );
  assert.ok(entry, "the open case is in the queue");
  assert.equal(entry.case_kind, "mentor_dispute");
  assert.equal(entry.reason, "The internship was not completed.");

  const reviewed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "valid", reason: "The evidence supports the student." },
    reviewer,
  );
  assert.equal(reviewed.status, 200, reviewed.text);
  assert.equal(reviewed.body?.status, "counted");
  assert.equal(reviewed.body?.counted_basis, "platform_decision");
  assert.equal(
    await countRows(current, "reputation_events"),
    0,
    "a platform-decided outcome never earns mentor reputation",
  );

  const read = await apiRequest(current, "GET", `/v1/outcomes/${outcomeId}`, undefined, student);
  const decisions = read.body?.decisions as { decision: string; reason: string }[];
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decision, "valid");
  assert.equal(decisions[0].reason, "The evidence supports the student.");
});

test("the reviewer routes refuse a non-admin, an admin without MFA, and a bad body", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".review-guards");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/dispute`,
    { reason: "Not completed." },
    mentor.token,
  );

  const mentorAttempt = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "valid", reason: "Mentor cannot review" },
    mentor.token,
  );
  assert.equal(mentorAttempt.status, 403);
  assert.equal(mentorAttempt.body?.code, "ROLE_REQUIRED");
  const queueAttempt = await apiRequest(current, "GET", "/v1/review-queue", undefined, student);
  assert.equal(queueAttempt.status, 403);

  const noMfa = await platformReviewer(current, "reviewer-no-mfa@example.com", false);
  const refused = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "valid", reason: "No second factor" },
    noMfa,
  );
  assert.equal(refused.status, 403);
  assert.equal(refused.body?.code, "MFA_REQUIRED");

  const reviewer = await platformReviewer(current, "reviewer-body@example.com");
  for (const body of [
    { decision: "valid" },
    { decision: "maybe", reason: "not a decision" },
    { decision: "valid", reason: "" },
    { decision: "valid", reason: "x".repeat(1_001) },
  ]) {
    const response = await apiRequest(
      current,
      "POST",
      `/v1/outcomes/${outcomeId}/review`,
      body,
      reviewer,
    );
    assert.equal(response.status, 422, `${JSON.stringify(body)}: ${response.text}`);
  }

  const invalid = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "invalid", reason: "Not a completed internship." },
    reviewer,
  );
  assert.equal(invalid.status, 200, invalid.text);
  assert.equal(invalid.body?.status, "rejected");

  const again = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "valid", reason: "Already decided." },
    reviewer,
  );
  assert.equal(again.status, 409);
  assert.equal(again.body?.code, "OUTCOME_INVALID_STATE");
});

test("invalid on a counted outcome reverses the ledger and the snapshot", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".clawback");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  const confirmed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    mentor.token,
  );
  assert.equal(confirmed.status, 200, confirmed.text);
  await current.client.query(
    "UPDATE outcomes SET cooling_ends_at = now() - interval '1 day' WHERE id = $1",
    [outcomeId],
  );
  const count = await countDueOutcomes(current.database.db);
  assert.equal(count.counted, 1);

  const reviewer = await platformReviewer(current, "reviewer-clawback@example.com");
  const reversed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "invalid", reason: "The employer withdrew the offer." },
    reviewer,
  );
  assert.equal(reversed.status, 200, reversed.text);
  assert.equal(reversed.body?.status, "reversed");

  const events = await current.client.query<{ event_type: string; points: string }>(
    "SELECT event_type, points FROM reputation_events WHERE outcome_id = $1 ORDER BY event_type",
    [outcomeId],
  );
  assert.deepEqual(
    events.rows.map((row) => row.event_type),
    ["COUNTED", "REVERSAL"],
  );
  assert.ok(Number(events.rows[1].points) < 0, "the reversal carries negated points");

  const snapshots = await new DrizzleReputationService(current.database.db).storedSnapshots(
    mentor.profileId,
  );
  assert.equal(snapshots[0]?.countedCount, 0);
  assert.equal(snapshots[0]?.pointsTotal, 0);
  const replayed = await new DrizzleReputationService(current.database.db).replay(mentor.profileId);
  assert.deepEqual(replayed, snapshots, "a replay reproduces the reversed total");

  const twice = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/review`,
    { decision: "invalid", reason: "Second clawback." },
    reviewer,
  );
  assert.equal(twice.status, 409);
});

/** The account id behind a mentor fixture, for the audit actor. */
async function userIdFor(current: TestApiStack, email: string): Promise<string> {
  const row = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  return row.rows[0].id;
}

test("an audit hold moves a confirmed outcome into review with one event and one audit row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".hold");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  const confirmed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${outcomeId}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    mentor.token,
  );
  assert.equal(confirmed.status, 200, confirmed.text);
  const auditEmails = await countRows(current, "outbox_events");

  const service = new DrizzleOutcomeService(current.database.db);
  const held = await service.hold({
    outcomeId,
    actorUserId: await userIdFor(current, "mentor.hold@example.edu.bd"),
    actorRole: "PLATFORM_ADMIN",
    reason: "sampled for an audit",
    requestId: "test-audit-hold",
  });
  assert.equal(held.status, "IN_PLATFORM_REVIEW");
  assert.equal(held.countedBasis, null, "a hold never counts anything");

  const events = await current.client.query<{
    event_type: string;
    from_status: string;
    to_status: string;
    payload: { reason?: string };
  }>(
    "SELECT event_type, from_status, to_status, payload FROM outcome_events WHERE outcome_id = $1 ORDER BY seq",
    [outcomeId],
  );
  const opened = events.rows.filter((row) => row.event_type === "CASE_OPENED");
  assert.equal(opened.length, 1, "exactly one case-opened event");
  assert.equal(opened[0].from_status, "CONFIRMED");
  assert.equal(opened[0].to_status, "IN_PLATFORM_REVIEW");
  assert.equal(opened[0].payload.reason, "sampled for an audit");

  const audit = await current.client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE object_id = $1 ORDER BY occurred_at",
    [outcomeId],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.action),
    ["OUTCOME_REPORTED", "OUTCOME_CONFIRMED", "OUTCOME_AUDIT_HELD"],
  );
  assert.equal(
    await countRows(current, "outbox_events"),
    auditEmails,
    "a hold tells nobody: no email is queued",
  );
});

test("a second hold is refused and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".hold2");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  assert.equal(
    (
      await apiRequest(
        current,
        "POST",
        `/v1/outcomes/${outcomeId}/confirm`,
        { contribution_level_confirmed: "HELPED" },
        mentor.token,
      )
    ).status,
    200,
  );

  const service = new DrizzleOutcomeService(current.database.db);
  const actorUserId = await userIdFor(current, "mentor.hold2@example.edu.bd");
  await service.hold({
    outcomeId,
    actorUserId,
    actorRole: "PLATFORM_ADMIN",
    reason: "first hold",
    requestId: "test-audit-hold-1",
  });

  const before = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM outcome_events WHERE outcome_id = $1",
    [outcomeId],
  );
  const auditBefore = await countRows(current, "audit_logs");
  await assert.rejects(
    service.hold({
      outcomeId,
      actorUserId,
      actorRole: "PLATFORM_ADMIN",
      reason: "second hold",
      requestId: "test-audit-hold-2",
    }),
    /cannot be held for audit/,
  );
  const after = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM outcome_events WHERE outcome_id = $1",
    [outcomeId],
  );
  assert.equal(after.rows[0].count, before.rows[0].count, "no second event");
  assert.equal(await countRows(current, "audit_logs"), auditBefore, "no second audit row");
});

test("a hold is refused from every state but CONFIRMED", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const service = new DrizzleOutcomeService(current.database.db);

  // PENDING_CONFIRMATION: a fresh report.
  const { student, mentorshipId } = await acceptedPair(current, ".hold3");
  const created = await report(current, student, reportBody(mentorshipId));
  const pendingId = String(created.body?.id);
  const actorUserId = await userIdFor(current, "mentor.hold3@example.edu.bd");
  await assert.rejects(
    service.hold({
      outcomeId: pendingId,
      actorUserId,
      actorRole: "PLATFORM_ADMIN",
      reason: "too early",
      requestId: "test-audit-hold-pending",
    }),
    /cannot be held for audit/,
  );

  // WITHDRAWN: a terminal state.
  const withdrawn = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${pendingId}/withdraw`,
    undefined,
    student,
  );
  assert.equal(withdrawn.status, 200, withdrawn.text);
  await assert.rejects(
    service.hold({
      outcomeId: pendingId,
      actorUserId,
      actorRole: "PLATFORM_ADMIN",
      reason: "already closed",
      requestId: "test-audit-hold-withdrawn",
    }),
    /cannot be held for audit/,
  );
  assert.equal(
    (await apiRequest(current, "GET", `/v1/outcomes/${pendingId}`, undefined, student)).body?.status,
    "withdrawn",
    "a refused hold changes nothing",
  );
});

test("a held outcome is skipped by the counting job and the queue lists it", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentor, mentorshipId } = await acceptedPair(current, ".hold4");
  const created = await report(current, student, reportBody(mentorshipId));
  const outcomeId = String(created.body?.id);
  assert.equal(
    (
      await apiRequest(
        current,
        "POST",
        `/v1/outcomes/${outcomeId}/confirm`,
        { contribution_level_confirmed: "HELPED" },
        mentor.token,
      )
    ).status,
    200,
  );

  const service = new DrizzleOutcomeService(current.database.db);
  await service.hold({
    outcomeId,
    actorUserId: await userIdFor(current, "mentor.hold4@example.edu.bd"),
    actorRole: "PLATFORM_ADMIN",
    reason: "anomaly flag",
    requestId: "test-audit-hold-queue",
  });

  // The job's predicate is `status = CONFIRMED AND cooling_ends_at <= now`; a
  // past deadline must still not pull a held row in.
  await current.client.query(
    "UPDATE outcomes SET cooling_ends_at = now() - interval '1 day' WHERE id = $1",
    [outcomeId],
  );
  const countDue = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM outcomes WHERE id = $1 AND status = 'CONFIRMED' AND cooling_ends_at <= now()",
    [outcomeId],
  );
  assert.equal(countDue.rows[0].count, "0", "the counting predicate excludes a held outcome");

  const queue = await apiRequest(current, "GET", "/v1/review-queue", undefined, await platformReviewer(current, "reviewer.hold@example.com"));
  assert.equal(queue.status, 200, queue.text);
  const ids = (queue.body?.data as Array<{ id: string; case_kind: string }>) ?? [];
  const held = ids.find((row) => row.id === outcomeId);
  assert.ok(held, "a held outcome is an ordinary review case");
});
