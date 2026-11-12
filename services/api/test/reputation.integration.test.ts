import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { responseReliability } from "@connect/domain";

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
import { OutcomesController } from "../src/outcomes/outcomes.controller.js";
import { OUTCOME_SERVICE } from "../src/outcomes/outcomes.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { countDueOutcomes } from "../src/reputation/counting-job.js";
import { DrizzleReputationService } from "../src/reputation/drizzle-reputation.service.js";
import { ReputationController } from "../src/reputation/reputation.controller.js";
import { REPUTATION_SERVICE } from "../src/reputation/reputation.tokens.js";
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
    ReputationController,
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
      { provide: REPUTATION_SERVICE, useValue: new DrizzleReputationService(database) },
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
      weekly_capacity: 4,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.equal(
    (await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token)).status,
    200,
  );
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

interface Pair {
  studentToken: string;
  mentorToken: string;
  mentorProfileId: string;
  mentorshipId: string;
}

async function acceptPair(current: TestApiStack, studentEmail: string, mentorEmail: string): Promise<Pair> {
  const studentToken = await studentWithProfile(current, studentEmail);
  const mentor = await activeMentor(current, mentorEmail);
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
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${created.body?.id}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  return {
    studentToken,
    mentorToken: mentor.token,
    mentorProfileId: mentor.profileId,
    mentorshipId: String(accepted.body?.mentorship_id),
  };
}

async function confirmedOutcome(current: TestApiStack, pair: Pair, title: string): Promise<string> {
  const reported = await apiRequest(
    current,
    "POST",
    "/v1/outcomes",
    {
      mentorship_id: pair.mentorshipId,
      outcome_type: "INTERNSHIP",
      title,
      description: "An internship offer after the mock interviews.",
      contribution_claimed: "HELPED",
    },
    pair.studentToken,
  );
  assert.equal(reported.status, 201, reported.text);
  const confirmed = await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${reported.body?.id}/confirm`,
    { contribution_level_confirmed: "HELPED" },
    pair.mentorToken,
  );
  assert.equal(confirmed.status, 200, confirmed.text);
  return String(reported.body?.id);
}

async function expireCooling(current: TestApiStack, outcomeId: string): Promise<void> {
  await current.client.query(
    "UPDATE outcomes SET cooling_ends_at = now() - interval '1 minute' WHERE id = $1",
    [outcomeId],
  );
}

test("a cooled confirmation counts once with one ledger event and the snapshot", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "count.student@example.com", "count.mentor@example.edu.bd");
  const outcomeId = await confirmedOutcome(current, pair, "Counted");

  const before = await countDueOutcomes(current.database.db);
  assert.deepEqual(before, { counted: 0, events: 0 }, "not counted before the deadline");

  await expireCooling(current, outcomeId);
  const result = await countDueOutcomes(current.database.db);
  assert.deepEqual(result, { counted: 1, events: 1 });

  const row = await current.client.query<{
    status: string;
    counted_at: Date | null;
    counted_basis: string | null;
  }>("SELECT status, counted_at, counted_basis FROM outcomes WHERE id = $1", [outcomeId]);
  assert.equal(row.rows[0]?.status, "COUNTED");
  assert.ok(row.rows[0]?.counted_at instanceof Date);
  assert.equal(row.rows[0]?.counted_basis, "MENTOR_CONFIRMED");

  const events = await current.client.query<{ event_type: string }>(
    "SELECT event_type::text AS event_type FROM outcome_events WHERE outcome_id = $1 ORDER BY seq",
    [outcomeId],
  );
  assert.deepEqual(
    events.rows.map((event) => event.event_type),
    ["REPORTED", "CONFIRMED", "COUNTED"],
  );

  const ledger = await current.client.query<{
    field_id: string;
    pair_factor: string;
    points: string;
    difficulty_weight: string;
    same_field: boolean;
  }>(
    `SELECT r.field_id, r.pair_factor, r.points::text AS points, r.difficulty_weight,
            r.field_id = o.field_id AS same_field
       FROM reputation_events r JOIN outcomes o ON o.id = r.outcome_id`,
  );
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0]?.same_field, true, "the field is copied from the outcome");
  assert.equal(ledger.rows[0]?.pair_factor, "1.0000");
  assert.equal(ledger.rows[0]?.points, "1.000000");
  assert.equal(ledger.rows[0]?.difficulty_weight, "1.0000");

  const snapshot = await current.client.query<{ counted_count: number; points_total: string }>(
    "SELECT counted_count, points_total::text AS points_total FROM field_impact_snapshots",
  );
  assert.deepEqual(snapshot.rows, [{ counted_count: 1, points_total: "1.000000" }]);

  const again = await countDueOutcomes(current.database.db);
  assert.deepEqual(again, { counted: 0, events: 0 }, "a second run counts nothing twice");
  assert.equal(
    (await current.client.query("SELECT id FROM reputation_events")).rowCount,
    1,
    "exactly one reputation event",
  );
});

test("an in-review or unexpired outcome is not counted", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "review.student@example.com", "review.mentor@example.edu.bd");
  const outcomeId = await confirmedOutcome(current, pair, "In review");
  await current.client.query("UPDATE outcomes SET status = 'IN_PLATFORM_REVIEW' WHERE id = $1", [
    outcomeId,
  ]);
  await expireCooling(current, outcomeId);

  assert.deepEqual(await countDueOutcomes(current.database.db), { counted: 0, events: 0 });
  assert.equal((await current.client.query("SELECT id FROM reputation_events")).rowCount, 0);
});

test("a conflict-declared outcome counts without earning the mentor reputation", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "coi.student@example.com", "coi.mentor@example.edu.bd");
  const outcomeId = await confirmedOutcome(current, pair, "Declared conflict");
  // The API routes a declared conflict to review, so this row is forced here to
  // exercise the counting guard on an ineligible counted outcome.
  await current.client.query("UPDATE outcomes SET coi_declared = true WHERE id = $1", [outcomeId]);
  await expireCooling(current, outcomeId);

  const result = await countDueOutcomes(current.database.db);
  assert.equal(result.counted, 1);

  const row = await current.client.query<{ status: string; counted_basis: string }>(
    "SELECT status, counted_basis FROM outcomes WHERE id = $1",
    [outcomeId],
  );
  assert.equal(row.rows[0]?.status, "COUNTED");
  assert.equal(row.rows[0]?.counted_basis, "PLATFORM_DECISION");
  assert.equal(
    (await current.client.query("SELECT id FROM reputation_events")).rowCount,
    0,
    "no reputation event for an ineligible outcome",
  );
  assert.equal((await current.client.query("SELECT id FROM field_impact_snapshots")).rowCount, 0);

  const impact = await apiRequest(current, "GET", "/v1/me/impact", undefined, pair.mentorToken);
  assert.deepEqual(
    impact.body,
    {
      data: [],
      counted_outcomes: 0,
      requests_decided_in_time: 1,
      requests_late_or_expired: 0,
    },
    "a platform-decided outcome is excluded",
  );
});

test("the pair factor falls to one half and the next student starts at one", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const first = await acceptPair(current, "pair.student@example.com", "pair.mentor@example.edu.bd");
  const firstOutcome = await confirmedOutcome(current, first, "First");
  await expireCooling(current, firstOutcome);
  await countDueOutcomes(current.database.db);

  const secondOutcome = await confirmedOutcome(current, first, "Second with the same mentor");
  await expireCooling(current, secondOutcome);
  await countDueOutcomes(current.database.db);

  const otherStudent = await tokenFor(current, "pair.other@example.com");
  await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { goals: "Goals", primary_field: "Engineering" },
    otherStudent,
  );
  const created = await apiRequest(
    current,
    "POST",
    "/v1/requests",
    {
      mentor_id: first.mentorProfileId,
      question: "Question",
      context_summary: "Context",
      target_outcome: "Outcome",
      expected_timeframe: "WITHIN_1_MONTH",
    },
    otherStudent,
  );
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${created.body?.id}/accept`,
    undefined,
    first.mentorToken,
  );
  const thirdPair: Pair = {
    studentToken: otherStudent,
    mentorToken: first.mentorToken,
    mentorProfileId: first.mentorProfileId,
    mentorshipId: String(accepted.body?.mentorship_id),
  };
  const thirdOutcome = await confirmedOutcome(current, thirdPair, "Third");
  await expireCooling(current, thirdOutcome);
  await countDueOutcomes(current.database.db);

  const factors = await current.client.query<{ pair_factor: string }>(
    "SELECT pair_factor FROM reputation_events ORDER BY occurred_at, created_at",
  );
  assert.deepEqual(
    factors.rows.map((row) => row.pair_factor),
    ["1.0000", "0.5000", "1.0000"],
  );
});

test("a replay of the ledger reproduces the stored snapshot exactly", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "replay.student@example.com", "replay.mentor@example.edu.bd");
  for (const title of ["One", "Two"]) {
    const outcomeId = await confirmedOutcome(current, pair, title);
    await expireCooling(current, outcomeId);
    await countDueOutcomes(current.database.db);
  }

  const service = new DrizzleReputationService(current.database.db);
  const replay = await service.replay(pair.mentorProfileId);
  const stored = await service.storedSnapshots(pair.mentorProfileId);
  assert.equal(replay.length, 1);
  assert.deepEqual(
    { ...stored[0], pointsTotal: Number(stored[0].pointsTotal.toFixed(6)) },
    { ...replay[0], pointsTotal: Number(replay[0].pointsTotal.toFixed(6)) },
  );
  assert.deepEqual(
    replay.map((row) => [row.countedCount, row.pointsTotal]),
    [[2, 1.5]],
    "one plus one half for the same pair",
  );

  // Perturbing a stored total breaks the equality, which is what keeps the
  // snapshot honest.
  await current.client.query("UPDATE field_impact_snapshots SET points_total = points_total + 1");
  const perturbed = await service.storedSnapshots(pair.mentorProfileId);
  assert.notEqual(Number(perturbed[0].pointsTotal), Number(replay[0].pointsTotal));
});

test("the impact read returns counts only and excludes every uncounted state", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "impact.student@example.com", "impact.mentor@example.edu.bd");
  const countedId = await confirmedOutcome(current, pair, "Counted");
  await expireCooling(current, countedId);
  await countDueOutcomes(current.database.db);

  // Outcomes in every other state, none of which may appear in a count.
  const reportOutcome = async (description: string): Promise<string> => {
    const response = await apiRequest(
      current,
      "POST",
      "/v1/outcomes",
      {
        mentorship_id: pair.mentorshipId,
        outcome_type: "INTERVIEW",
        description,
        contribution_claimed: "MINOR",
      },
      pair.studentToken,
    );
    assert.equal(response.status, 201, response.text);
    return String(response.body?.id);
  };

  const pendingId = await reportOutcome("Still pending.");
  const confirmedId = await reportOutcome("Confirmed but not counted.");
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${confirmedId}/confirm`,
    { contribution_level_confirmed: "MINOR" },
    pair.mentorToken,
  );
  const reviewId = await reportOutcome("In platform review.");
  await apiRequest(
    current,
    "POST",
    `/v1/outcomes/${reviewId}/dispute`,
    { reason: "Not this mentor's doing" },
    pair.mentorToken,
  );
  const withdrawnId = await reportOutcome("Withdrawn.");
  await apiRequest(current, "POST", `/v1/outcomes/${withdrawnId}/withdraw`, undefined, pair.studentToken);
  const rejectedId = await reportOutcome("Rejected.");
  await current.client.query("UPDATE outcomes SET status = 'REJECTED', rejected_at = now() WHERE id = $1", [
    rejectedId,
  ]);
  void pendingId;

  const states = await current.client.query<{ status: string }>(
    "SELECT status FROM outcomes ORDER BY status",
  );
  assert.deepEqual(
    states.rows.map((row) => row.status),
    // Enum order, not alphabetical: PostgreSQL sorts an enum by its definition.
    [
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "IN_PLATFORM_REVIEW",
      "COUNTED",
      "REJECTED",
      "WITHDRAWN",
    ],
  );

  const own = await apiRequest(current, "GET", "/v1/me/impact", undefined, pair.mentorToken);
  assert.equal(own.status, 200, own.text);
  assert.deepEqual(Object.keys(own.body ?? {}).sort(), [
    "counted_outcomes",
    "data",
    "requests_decided_in_time",
    "requests_late_or_expired",
  ]);
  assert.equal(own.body?.counted_outcomes, 1);
  const rows = own.body?.data as Record<string, unknown>[];
  assert.deepEqual(Object.keys(rows[0]).sort(), ["count", "field_id", "field_name", "outcome_type"]);
  assert.equal(rows[0].count, 1);
  for (const forbidden of ["score", "points", "tier", "ranking"]) {
    assert.equal(forbidden in (own.body ?? {}), false);
  }

  const publicRead = await apiRequest(
    current,
    "GET",
    `/v1/mentors/${pair.mentorProfileId}/impact`,
    undefined,
    pair.studentToken,
  );
  assert.equal(publicRead.status, 200, publicRead.text);
  assert.equal(publicRead.body?.counted_outcomes, 1);

  const anonymous = await apiRequest(current, "GET", "/v1/me/impact");
  assert.equal(anonymous.status, 401);

  const unknown = await apiRequest(
    current,
    "GET",
    "/v1/mentors/11111111-1111-1111-1111-111111111111/impact",
    undefined,
    pair.studentToken,
  );
  assert.equal(unknown.status, 404, "an absent mentor profile is not found");

  await current.client.query("UPDATE mentor_profiles SET status = 'SUSPENDED' WHERE id = $1", [
    pair.mentorProfileId,
  ]);
  const inactive = await apiRequest(
    current,
    "GET",
    `/v1/mentors/${pair.mentorProfileId}/impact`,
    undefined,
    pair.studentToken,
  );
  assert.equal(inactive.status, 404, "a non-active mentor is not found");
});

/** Copies the pair's existing request shape with a chosen status and timing. */
async function seedRequest(
  current: TestApiStack,
  mentorProfileId: string,
  input: { status: string; decidedAfterHours?: number },
): Promise<void> {
  await current.client.query(
    `INSERT INTO mentorship_requests
       (student_profile_id, mentor_profile_id, field_id, question, context_summary,
        target_outcome, timeframe, status, decided_at, expires_at, created_at, updated_at)
     SELECT student_profile_id, mentor_profile_id, field_id, 'A follow-up question',
            'Second-year student', 'Understand the field', timeframe, $2,
            CASE WHEN $3::int IS NULL THEN NULL ELSE created_at + ($3::int * interval '1 hour') END,
            created_at + interval '49 hours', created_at, created_at
     FROM mentorship_requests WHERE mentor_profile_id = $1 LIMIT 1`,
    [mentorProfileId, input.status, input.decidedAfterHours ?? null],
  );
}

test("the own impact read reports the two request counts and the public read does not", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const pair = await acceptPair(current, "reliability.student@example.com", "reliability.mentor@example.edu.bd");
  // The accept above is one request decided inside the window; add the rest.
  await seedRequest(current, pair.mentorProfileId, { status: "DECLINED", decidedAfterHours: 2 });
  await seedRequest(current, pair.mentorProfileId, { status: "ACCEPTED", decidedAfterHours: 72 });
  await seedRequest(current, pair.mentorProfileId, { status: "EXPIRED" });
  await seedRequest(current, pair.mentorProfileId, { status: "WITHDRAWN" });
  await seedRequest(current, pair.mentorProfileId, { status: "PENDING" });

  const own = await apiRequest(current, "GET", "/v1/me/impact", undefined, pair.mentorToken);
  assert.equal(own.status, 200, own.text);
  assert.equal(own.body?.requests_decided_in_time, 2, "two decisions inside the window");
  assert.equal(own.body?.requests_late_or_expired, 2, "one late decision and one expiry");

  // The SQL aggregate and the pure rule must agree on the same rows.
  const rows = await current.client.query<{ status: string; created_at: Date; decided_at: Date | null }>(
    "SELECT status, created_at, decided_at FROM mentorship_requests WHERE mentor_profile_id = $1",
    [pair.mentorProfileId],
  );
  assert.deepEqual(
    responseReliability(
      rows.rows.map((row) => ({
        status: row.status,
        createdAt: new Date(row.created_at),
        decidedAt: row.decided_at ? new Date(row.decided_at) : null,
      })),
      48,
    ),
    {
      decidedInTime: Number(own.body?.requests_decided_in_time),
      lateOrExpired: Number(own.body?.requests_late_or_expired),
    },
  );

  for (const forbidden of ["response_rate", "percentage", "score", "points", "tier", "ranking", "student_id"]) {
    assert.equal(forbidden in (own.body ?? {}), false, `the own read exposes no ${forbidden}`);
  }

  const publicRead = await apiRequest(
    current,
    "GET",
    `/v1/mentors/${pair.mentorProfileId}/impact`,
    undefined,
    pair.mentorToken,
  );
  assert.equal(publicRead.status, 200, publicRead.text);
  assert.deepEqual(Object.keys(publicRead.body ?? {}).sort(), ["counted_outcomes", "data"]);
  assert.equal("requests_decided_in_time" in (publicRead.body ?? {}), false);
  assert.equal("requests_late_or_expired" in (publicRead.body ?? {}), false);
});

test("a non-mentor sees an empty impact list", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "noimpact@example.com");
  const response = await apiRequest(current, "GET", "/v1/me/impact", undefined, student);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    data: [],
    counted_outcomes: 0,
    requests_decided_in_time: 0,
    requests_late_or_expired: 0,
  });
});
