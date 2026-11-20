import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { InstitutionsController } from "../src/institutions/institutions.controller.js";
import { InstitutionDashboardController } from "../src/institutions/institution-dashboard.controller.js";
import { INSTITUTIONS_SERVICE } from "../src/institutions/institutions.tokens.js";
import { INSTITUTION_DASHBOARD_SERVICE } from "../src/institutions/institution-dashboard.service.js";
import { DrizzleInstitutionsService } from "../src/institutions/drizzle-institutions.service.js";
import { DrizzleInstitutionDashboardService } from "../src/institutions/drizzle-institution-dashboard.service.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

/**
 * The `FR-INST-02` aggregate read: scoping, both 404s, the floor of five, the
 * by-field omission and the payload's key set.
 *
 * Fixture: institution A has five verified alumni (two of them active mentors),
 * thirteen requests to those mentors (twelve accepted in time, one expired) and
 * nine counted outcomes (five in one field, four in another); institution B has
 * four verified alumni and nothing else, which is the withheld side.
 */

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

interface Fixture {
  institutionA: string;
  institutionB: string;
  adminA: string;
  adminB: string;
}

before(async () => {
  const started = await startApiStack({
    controllers: [AuthController, MeRolesController, InstitutionsController, InstitutionDashboardController],
    requestIdRoutes: [
      AuthController,
      MeRolesController,
      InstitutionsController,
      InstitutionDashboardController,
    ],
    providers: (database) => [
      { provide: INSTITUTIONS_SERVICE, useValue: new DrizzleInstitutionsService(database) },
      {
        provide: INSTITUTION_DASHBOARD_SERVICE,
        useValue: new DrizzleInstitutionDashboardService(database),
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
    // truncateAll() does not know institutions; a leaked row would falsify counts.
    await stack.client.query("DELETE FROM institutions");
    await stack.client.query("DELETE FROM outbox_events");
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

async function account(
  current: TestApiStack,
  email: string,
): Promise<{ token: string; userId: string }> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  const user = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const userId = user.rows[0]?.id;
  assert.ok(userId, `${email} must exist`);
  return { token: String(signedIn.body?.session_token), userId };
}

async function enrollFactor(current: TestApiStack, userId: string): Promise<void> {
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [userId]);
  await current.client.query(
    "INSERT INTO two_factors (id, secret, backup_codes, user_id, verified) VALUES ($1, 'TEST-TOTP-SECRET', '[]', $2, true)",
    [`factor-${userId}`, userId],
  );
}

async function institutionAdmin(
  current: TestApiStack,
  email: string,
  institutionId: string,
): Promise<{ token: string; userId: string }> {
  const created = await account(current, email);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role, institution_id) VALUES ($1, 'INSTITUTION_ADMIN', $2)",
    [created.userId, institutionId],
  );
  await enrollFactor(current, created.userId);
  return created;
}

async function institution(current: TestApiStack, name: string): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ($1, 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
    [name],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function field(current: TestApiStack, name: string, slug: string): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO fields (name, normalized_slug) VALUES ($1, $2) RETURNING id",
    [name, slug],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function affiliation(current: TestApiStack, userId: string, institutionId: string): Promise<void> {
  await current.client.query(
    `INSERT INTO affiliations (user_id, institution_id, kind, level, method, status, verified_at)
     VALUES ($1, $2, 'ALUMNUS', 'LEVEL_1', 'INSTITUTIONAL_EMAIL', 'VERIFIED', now())`,
    [userId, institutionId],
  );
}

async function studentProfile(
  current: TestApiStack,
  userId: string,
  fieldId: string,
): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO student_profiles (user_id, goals, primary_field_id) VALUES ($1, 'find a first role', $2) RETURNING id",
    [userId, fieldId],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function mentorProfile(
  current: TestApiStack,
  userId: string,
  fieldId: string,
): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    `INSERT INTO mentor_profiles
       (user_id, primary_field_id, status, onboarding_status, activated_at, headline, bio, expertise_summary, scope_statement, weekly_capacity)
     VALUES ($1, $2, 'ACTIVE', 'AFFILIATION_VERIFIED', now(), 'Mentor', 'Bio', 'Expertise', 'Scope', 3)
     RETURNING id`,
    [userId, fieldId],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function requestRow(
  current: TestApiStack,
  input: {
    studentProfileId: string;
    mentorProfileId: string;
    fieldId: string;
    status: "ACCEPTED" | "EXPIRED";
    createdAt: Date;
    decidedAt?: Date | null;
    expiryReason?: string | null;
  },
): Promise<string> {
  const expiresAt = new Date(input.createdAt.getTime() + 48 * 60 * 60 * 1000);
  const created = await current.client.query<{ id: string }>(
    `INSERT INTO mentorship_requests
       (student_profile_id, mentor_profile_id, field_id, question, context_summary, target_outcome,
        timeframe, status, decided_at, expires_at, expiry_reason, created_at, updated_at)
     VALUES ($1, $2, $3, 'How do I start?', 'Final-year student', 'Get a first role',
        'WITHIN_1_MONTH', $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [
      input.studentProfileId,
      input.mentorProfileId,
      input.fieldId,
      input.status,
      input.decidedAt ?? null,
      expiresAt,
      input.expiryReason ?? null,
      input.createdAt,
    ],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function mentorshipRow(
  current: TestApiStack,
  input: { requestId: string; studentProfileId: string; mentorProfileId: string; fieldId: string },
): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    `INSERT INTO mentorships (request_id, student_profile_id, mentor_profile_id, field_id, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
    [input.requestId, input.studentProfileId, input.mentorProfileId, input.fieldId],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function countedOutcome(
  current: TestApiStack,
  input: {
    mentorshipId: string;
    studentProfileId: string;
    mentorProfileId: string;
    fieldId: string;
    countedAt: Date;
  },
): Promise<void> {
  await current.client.query(
    `INSERT INTO outcomes
       (mentorship_id, student_profile_id, mentor_profile_id, field_id, outcome_type, description,
        contribution_claimed, status, counted_basis, mentor_decision_due_at, confirmed_at, counted_at, cooling_ends_at)
     VALUES ($1, $2, $3, $4, 'SKILL_MILESTONE', 'Shipped a feature', 'HELPED', 'COUNTED',
        'MENTOR_CONFIRMED', $5, $5, $5, $5)`,
    [
      input.mentorshipId,
      input.studentProfileId,
      input.mentorProfileId,
      input.fieldId,
      input.countedAt,
    ],
  );
}

/** Builds the whole fixture and hands back the admin tokens. */
async function buildFixture(current: TestApiStack): Promise<Fixture> {
  const institutionA = await institution(current, "Alpha University");
  const institutionB = await institution(current, "Beta University");
  const fieldX = await field(current, "Software Engineering", "software-engineering");
  const fieldY = await field(current, "Product Design", "product-design");

  const adminA = await institutionAdmin(current, "admin-a@institutions.example.com", institutionA);
  const adminB = await institutionAdmin(current, "admin-b@institutions.example.com", institutionB);

  // Five verified alumni at A, two of them active mentors.
  const alumniA: string[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const created = await account(current, `alumni-${index}@alpha.example.com`);
    await affiliation(current, created.userId, institutionA);
    alumniA.push(created.userId);
  }
  const mentorOne = await mentorProfile(current, alumniA[0] as string, fieldX);
  const mentorTwo = await mentorProfile(current, alumniA[1] as string, fieldY);

  // Four verified alumni at B: the withheld side.
  for (let index = 1; index <= 4; index += 1) {
    const created = await account(current, `alumni-${index}@beta.example.com`);
    await affiliation(current, created.userId, institutionB);
  }

  const students: string[] = [];
  for (const userId of [alumniA[2] as string, alumniA[3] as string, alumniA[4] as string]) {
    students.push(await studentProfile(current, userId, fieldX));
  }

  // Twelve accepted requests decided within the window, one expired deadline.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fulfilled: { requestId: string; studentProfileId: string }[] = [];
  for (let index = 0; index < 12; index += 1) {
    const studentProfileId = students[index % students.length] as string;
    const requestId = await requestRow(current, {
      studentProfileId,
      mentorProfileId: mentorOne,
      fieldId: fieldX,
      status: "ACCEPTED",
      createdAt: threeDaysAgo,
      decidedAt: new Date(threeDaysAgo.getTime() + 60 * 60 * 1000),
    });
    fulfilled.push({ requestId, studentProfileId });
  }
  await requestRow(current, {
    studentProfileId: students[0] as string,
    mentorProfileId: mentorOne,
    fieldId: fieldX,
    status: "EXPIRED",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    expiryReason: "DEADLINE",
  });

  // Nine counted outcomes: five in field X, four in field Y.
  const countedAt = new Date(Date.now() - 60 * 60 * 1000);
  for (let index = 0; index < 9; index += 1) {
    const entry = fulfilled[index] as { requestId: string; studentProfileId: string };
    const fieldId = index < 5 ? fieldX : fieldY;
    const mentorshipId = await mentorshipRow(current, {
      requestId: entry.requestId,
      studentProfileId: entry.studentProfileId,
      mentorProfileId: mentorOne,
      fieldId,
    });
    await countedOutcome(current, {
      mentorshipId,
      studentProfileId: entry.studentProfileId,
      mentorProfileId: mentorOne,
      fieldId,
      countedAt,
    });
  }
  // mentorTwo exists so `active_mentors` is not a single-person slice.
  assert.ok(mentorTwo);

  return {
    institutionA,
    institutionB,
    adminA: adminA.token,
    adminB: adminB.token,
  };
}

const AGGREGATES = "/v1/institution/aggregates";

function aggregatesPath(institutionId: string): string {
  return `${AGGREGATES}?institution_id=${institutionId}`;
}

test("an assigned admin with a second factor reads its own institution, counters only", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const response = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, fixture.adminA);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get("cache-control"), "no-store");

  assert.deepEqual(Object.keys(response.body ?? {}).sort(), [
    "counted_outcomes_by_field",
    "institution_id",
    "outcomes_confirmed",
    "outcomes_reported",
    "requests_accepted",
    "requests_decided",
    "requests_decided_in_time",
    "requests_received",
    "suppressed",
    "verified_alumni",
  ]);

  assert.equal(response.body?.institution_id, fixture.institutionA);
  assert.equal(response.body?.verified_alumni, 5);
  // Two active mentors is below the floor: omitted and named.
  assert.equal(response.body?.active_mentors, undefined);
  assert.equal(response.body?.requests_received, 13);
  assert.equal(response.body?.requests_accepted, 12);
  assert.equal(response.body?.requests_decided, 13);
  assert.equal(response.body?.requests_decided_in_time, 12);
  assert.equal(response.body?.requests_late_or_expired, undefined);
  assert.equal(response.body?.outcomes_reported, 9);
  assert.equal(response.body?.outcomes_confirmed, 9);
  assert.deepEqual(response.body?.suppressed, ["active_mentors", "requests_late_or_expired"]);
});

test("the payload carries no rate, score, ranking or student identifier", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const response = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, fixture.adminA);
  assert.equal(response.status, 200, response.text);

  const forbidden = /share|rate|percent|score|rank|student|user_id/i;
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        assert.equal(forbidden.test(key), false, `${path}.${key} must not appear`);
        walk(entry, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === "number") {
      assert.equal(Number.isInteger(value), true, `${path} must be an integer`);
    }
  };
  walk(response.body, "body");
  // The by-field rows carry a field id and a name, never a person.
  const rows = response.body?.counted_outcomes_by_field as Record<string, unknown>[];
  assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ["counted", "field_id", "field_name"]);
});

test("a by-field row of four is omitted and one of five is reported", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const response = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, fixture.adminA);
  assert.equal(response.status, 200, response.text);
  const rows = response.body?.counted_outcomes_by_field as { field_name: string; counted: number }[];
  assert.deepEqual(
    rows.map((row) => [row.field_name, row.counted]),
    [["Software Engineering", 5]],
  );
  assert.equal(JSON.stringify(response.body?.suppressed).includes("field"), false);
});

test("four verified alumni are withheld and named; another institution's admin sees its own four", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const response = await apiRequest(current, "GET", aggregatesPath(fixture.institutionB), undefined, fixture.adminB);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body?.verified_alumni, undefined);
  assert.deepEqual(response.body?.counted_outcomes_by_field, []);
  const suppressed = response.body?.suppressed as string[];
  assert.ok(suppressed.includes("verified_alumni"), String(suppressed));
  assert.equal(suppressed.length, 9, "every metric is below the floor at B");
});

test("an unadministered id and a nonexistent id answer the same 404 problem", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const foreign = await apiRequest(current, "GET", aggregatesPath(fixture.institutionB), undefined, fixture.adminA);
  const missing = await apiRequest(
    current,
    "GET",
    aggregatesPath("00000000-0000-0000-0000-000000000000"),
    undefined,
    fixture.adminA,
  );

  for (const response of [foreign, missing]) {
    assert.equal(response.status, 404, response.text);
    assert.equal(response.body?.code, "INSTITUTION_NOT_FOUND");
    assert.equal(response.body?.title, "Not found");
    assert.equal(response.body?.detail, "no institution matches this request");
  }
  // `instance` names the requested URL and `request_id` is per request; the rest
  // of the body is identical, so the parameter discloses nothing.
  assert.equal(foreign.body?.status, missing.body?.status);
  assert.equal(foreign.body?.type, missing.body?.type);
  assert.equal(JSON.stringify(foreign.body).includes("verified_alumni"), false);
});

test("a student, a mentor and an unassigned platform admin read nothing; anonymous is 401", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  const anonymous = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA));
  assert.equal(anonymous.status, 401);

  const student = await account(current, "student-caller@example.com");
  const asStudent = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, student.token);
  assert.equal(asStudent.status, 403);
  assert.equal(asStudent.body?.code, "ROLE_REQUIRED");

  const mentor = await account(current, "mentor-caller@example.com");
  await current.client.query("INSERT INTO role_assignments (user_id, role) VALUES ($1, 'MENTOR')", [
    mentor.userId,
  ]);
  await enrollFactor(current, mentor.userId);
  const asMentor = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, mentor.token);
  assert.equal(asMentor.status, 403);
  assert.equal(asMentor.body?.code, "ROLE_REQUIRED");

  const platform = await account(current, "platform-caller@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [platform.userId],
  );
  await enrollFactor(current, platform.userId);
  const asPlatform = await apiRequest(current, "GET", aggregatesPath(fixture.institutionA), undefined, platform.token);
  assert.equal(asPlatform.status, 403);
  assert.equal(asPlatform.body?.code, "ROLE_REQUIRED");
});

test("a missing or malformed institution_id is a 422, not a disclosure", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);

  for (const path of [AGGREGATES, `${AGGREGATES}?institution_id=not-a-uuid`]) {
    const response = await apiRequest(current, "GET", path, undefined, fixture.adminA);
    assert.equal(response.status, 422, `${path}: ${response.text}`);
    assert.equal(response.body?.code, "VALIDATION_FAILED");
    assert.match(String(response.body?.detail), /institution_id/);
  }
});

test("the institution list pages by cursor with no repeat and no omission", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const fixture = await buildFixture(current);
  await institution(current, "Gamma University");
  const platform = await account(current, "platform-list@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [platform.userId],
  );
  await enrollFactor(current, platform.userId);

  const first = await apiRequest(current, "GET", "/v1/institutions?limit=2", undefined, platform.token);
  assert.equal(first.status, 200, first.text);
  const firstRows = (first.body?.data ?? []) as { id: string; name: string }[];
  assert.equal(firstRows.length, 2);
  assert.ok(first.body?.next_cursor);

  const second = await apiRequest(
    current,
    "GET",
    `/v1/institutions?limit=2&cursor=${encodeURIComponent(String(first.body?.next_cursor))}`,
    undefined,
    platform.token,
  );
  assert.equal(second.status, 200, second.text);
  const secondRows = (second.body?.data ?? []) as { id: string; name: string }[];
  assert.equal(secondRows.length, 1);
  assert.equal(second.body?.next_cursor ?? null, null);

  const seen = [...firstRows, ...secondRows].map((row) => row.name);
  assert.deepEqual(seen, ["Alpha University", "Beta University", "Gamma University"]);
  assert.equal(new Set(seen).size, 3);
  assert.ok(fixture.institutionA && fixture.institutionB);
});

test("a malformed cursor and an out-of-range limit are 422", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const platform = await account(current, "platform-bounds@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [platform.userId],
  );
  await enrollFactor(current, platform.userId);

  for (const query of ["?cursor=not-a-cursor", "?limit=0", "?limit=101", "?limit=abc"]) {
    const response = await apiRequest(current, "GET", `/v1/institutions${query}`, undefined, platform.token);
    assert.equal(response.status, 422, `${query}: ${response.text}`);
    assert.equal(response.body?.code, "VALIDATION_FAILED");
  }
});

test("the default page is fifty rows and sends no next_cursor when it holds them all", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await institution(current, "Solo University");
  const platform = await account(current, "platform-default@example.com");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [platform.userId],
  );
  await enrollFactor(current, platform.userId);

  const response = await apiRequest(current, "GET", "/v1/institutions", undefined, platform.token);
  assert.equal(response.status, 200, response.text);
  assert.equal(((response.body?.data ?? []) as unknown[]).length, 1);
  assert.equal(response.body?.next_cursor ?? null, null);
});
