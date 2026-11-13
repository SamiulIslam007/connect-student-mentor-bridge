import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { DrizzleMatchingService } from "../src/matching/drizzle-matching.service.js";
import { MatchingController } from "../src/matching/matching.controller.js";
import { MATCHING_SERVICE } from "../src/matching/matching.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { SUGGESTION_POOL_LIMIT } from "../src/profiles/profiles.service.js";
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
    controllers: [AuthController, MeRolesController, ProfilesController, MatchingController],
    requestIdRoutes: [AuthController, MeRolesController, ProfilesController, MatchingController],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      {
        provide: MATCHING_SERVICE,
        useValue: new DrizzleMatchingService(new DrizzleProfilesService(database)),
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

async function tokenFor(current: TestApiStack, email: string): Promise<string> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200);
  return String(signedIn.body?.session_token);
}

async function mentorTokenFor(current: TestApiStack, email: string): Promise<string> {
  const token = await tokenFor(current, email);
  const granted = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  assert.equal(granted.status, 200, granted.text);
  return token;
}

async function userIdFor(current: TestApiStack, email: string): Promise<string> {
  const result = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  assert.ok(result.rows[0], `${email} must exist`);
  return result.rows[0].id;
}

/** The pilot's field names; the profile save creates the rows once. */
const PRIMARY_FIELD = "Software engineering";
const SHARED_FIELD = "Databases";
const OTHER_FIELD = "Civil engineering";

const studentProfile = {
  goals: "Become a backend engineer",
  primary_field: PRIMARY_FIELD,
  interest_fields: [SHARED_FIELD],
  languages: ["EN"],
};

interface SeedOptions {
  institutionId: string;
  department: string;
  batchYear: number;
  primaryField?: string;
  fields?: string[];
  weeklyCapacity?: number;
  accessMode?: "OPEN" | "APPLICATION_ONLY" | "PAUSED";
  status?: "DRAFT" | "ACTIVE";
  availability?: { weekday: number; startMinute: number; endMinute: number };
  verifyAffiliation?: boolean;
}

async function seedMentor(
  current: TestApiStack,
  email: string,
  options: SeedOptions,
): Promise<{ id: string; userId: string }> {
  const token = await mentorTokenFor(current, email);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Backend engineer",
      bio: "Eight years building APIs.",
      expertise_summary: "API design, databases",
      scope_statement: "I can review design docs.",
      primary_field: options.primaryField ?? PRIMARY_FIELD,
      fields: options.fields ?? [SHARED_FIELD],
      languages: ["EN"],
      weekly_capacity: options.weeklyCapacity ?? 3,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);

  const userId = await userIdFor(current, email);
  const updated = await current.client.query<{ id: string }>(
    `UPDATE mentor_profiles
        SET status = $2::mentor_status, access_mode = $3::mentor_access_mode
      WHERE user_id = $1
      RETURNING id`,
    [userId, options.status ?? "ACTIVE", options.accessMode ?? "OPEN"],
  );
  const id = updated.rows[0]?.id;
  assert.ok(id, `${email} must have a mentor profile`);

  if (options.verifyAffiliation !== false) {
    await current.client.query(
      `INSERT INTO affiliations (user_id, institution_id, kind, department, batch_year, level, method, status, verified_at)
       VALUES ($1, $2, 'ALUMNUS', $3, $4, 'LEVEL_1', 'ADMIN_ATTESTATION', 'VERIFIED', now())`,
      [userId, options.institutionId, options.department, options.batchYear],
    );
  }
  if (options.availability) {
    await current.client.query(
      `INSERT INTO availability_windows (user_id, context, weekday, start_minute, end_minute, timezone)
       VALUES ($1, 'MENTOR', $2, $3, $4, 'Asia/Dhaka')`,
      [userId, options.availability.weekday, options.availability.startMinute, options.availability.endMinute],
    );
  }

  return { id, userId };
}

interface StudentOptions {
  institutionId?: string | null;
  department?: string;
  batchYear?: number;
  availability?: { weekday: number; startMinute: number; endMinute: number };
  withProfile?: boolean;
}

async function seedStudent(
  current: TestApiStack,
  email: string,
  options: StudentOptions = {},
): Promise<{ token: string; userId: string; studentProfileId: string | null }> {
  const token = await tokenFor(current, email);
  const userId = await userIdFor(current, email);

  let studentProfileId: string | null = null;
  if (options.withProfile !== false) {
    const saved = await apiRequest(current, "PUT", "/v1/me/student-profile", studentProfile, token);
    assert.equal(saved.status, 200, saved.text);
    const row = await current.client.query<{ id: string }>(
      "SELECT id FROM student_profiles WHERE user_id = $1",
      [userId],
    );
    studentProfileId = row.rows[0]?.id ?? null;
  }

  if (options.institutionId) {
    await current.client.query(
      `INSERT INTO affiliations (user_id, institution_id, kind, department, batch_year, level, method, status, verified_at)
       VALUES ($1, $2, 'STUDENT', $3, $4, 'LEVEL_1', 'ADMIN_ATTESTATION', 'VERIFIED', now())`,
      [userId, options.institutionId, options.department ?? "CSE", options.batchYear ?? 2020],
    );
  }
  if (options.availability) {
    await current.client.query(
      `INSERT INTO availability_windows (user_id, context, weekday, start_minute, end_minute, timezone)
       VALUES ($1, 'STUDENT', $2, $3, $4, 'Asia/Dhaka')`,
      [userId, options.availability.weekday, options.availability.startMinute, options.availability.endMinute],
    );
  }
  return { token, userId, studentProfileId };
}

async function seedInstitution(current: TestApiStack, name: string): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    `INSERT INTO institutions (name, kind, country_code, status)
     VALUES ($1, 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id`,
    [name],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

const SUGGESTION_KEYS = [
  "access_mode",
  "access_state",
  "display_name",
  "fields",
  "headline",
  "id",
  "languages",
  "limited_information",
  "primary_field",
  "reasons",
];

function suggestionIds(body: Record<string, unknown> | undefined): string[] {
  return ((body?.data as { id: string }[] | undefined) ?? []).map((entry) => entry.id);
}

function directoryIds(body: Record<string, unknown> | undefined): string[] {
  return ((body?.data as { id: string }[] | undefined) ?? []).map((card) => card.id);
}

test("a student receives at most five mentors, each with reasons and no score", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Suggestion University");
  const student = await seedStudent(current, "suggest-five@example.com", {
    institutionId: institution,
  });
  for (let index = 1; index <= 6; index += 1) {
    await seedMentor(current, `suggest-five-${index}@example.com`, {
      institutionId: institution,
      department: "CSE",
      batchYear: 2020,
      availability: { weekday: 1, startMinute: 900, endMinute: 1100 },
    });
  }

  const response = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(response.status, 200, response.text);
  const entries = (response.body?.data ?? []) as Record<string, unknown>[];
  assert.equal(entries.length, 5, "the set size is five, never six");

  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), SUGGESTION_KEYS);
    const reasons = entry.reasons as string[];
    assert.ok(reasons.length >= 1 && reasons.length <= 3, "one to three reasons");
    assert.equal(typeof entry.limited_information, "boolean");
    for (const forbidden of ["score", "points", "tier", "rank", "email", "user_id", "bio"]) {
      assert.ok(!(forbidden in entry), `${forbidden} must not be in a suggestion`);
    }
  }
  assert.ok(!response.text.includes("@example.com"), "no email reaches the payload");
  assert.ok(!response.text.includes('"score"'), "no score key in the body");
});

test("a full mentor is absent from suggestions and present in the directory as full", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Capacity University");
  const student = await seedStudent(current, "suggest-full@example.com", {
    institutionId: institution,
  });
  const mentor = await seedMentor(current, "suggest-full-mentor@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
    weeklyCapacity: 1,
  });

  const field = await current.client.query<{ primary_field_id: string }>(
    "SELECT primary_field_id FROM student_profiles WHERE id = $1",
    [student.studentProfileId],
  );
  assert.ok(student.studentProfileId);
  await current.client.query(
    `INSERT INTO mentorship_requests
       (student_profile_id, mentor_profile_id, field_id, question, context_summary,
        target_outcome, timeframe, expires_at)
     VALUES ($1, $2, $3, 'How do I start?', 'A summary long enough to pass validation.',
             'A plan', 'WITHIN_1_MONTH', now() + interval '48 hours')`,
    [student.studentProfileId, mentor.id, field.rows[0]?.primary_field_id],
  );

  const suggestions = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(suggestions.status, 200, suggestions.text);
  assert.deepEqual(suggestionIds(suggestions.body), []);

  const directory = await apiRequest(current, "GET", "/v1/mentors");
  assert.equal(directory.status, 200);
  assert.deepEqual(directoryIds(directory.body), [mentor.id]);
  const card = (directory.body?.data as { access_state: string }[])[0];
  assert.equal(card.access_state, "full");
});

test("application-only, paused, non-active and unrelated mentors are all absent", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Eligibility University");
  const student = await seedStudent(current, "suggest-eligibility@example.com", {
    institutionId: institution,
  });
  const eligible = await seedMentor(current, "eligible@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
  });
  await seedMentor(current, "application-only@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
    accessMode: "APPLICATION_ONLY",
  });
  await seedMentor(current, "paused@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
    accessMode: "PAUSED",
  });
  await seedMentor(current, "draft@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
    status: "DRAFT",
  });
  const unrelated = await seedMentor(current, "unrelated@example.com", {
    institutionId: institution,
    department: "CE",
    batchYear: 2020,
    primaryField: OTHER_FIELD,
    fields: [],
  });

  const suggestions = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(suggestions.status, 200, suggestions.text);
  assert.deepEqual(suggestionIds(suggestions.body), [eligible.id]);

  // The same mentors are still visible in the unfiltered directory.
  const directory = await apiRequest(current, "GET", "/v1/mentors");
  const visible = directoryIds(directory.body);
  assert.ok(visible.includes(unrelated.id), "an unrelated mentor stays in the directory");
});

test("a suspended account is absent from suggestions and eligible again after a lift", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Suspension University");
  const student = await seedStudent(current, "suggest-suspended@example.com", {
    institutionId: institution,
  });
  const suspended = await seedMentor(current, "suspended-suggest@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
  });
  const eligible = await seedMentor(current, "eligible-suggest@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
  });

  await current.client.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [
    suspended.userId,
  ]);
  const without = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(without.status, 200, without.text);
  assert.deepEqual(suggestionIds(without.body), [eligible.id], "only the active account is suggested");

  await current.client.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [suspended.userId]);
  const withBoth = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.deepEqual(
    suggestionIds(withBoth.body).sort(),
    [eligible.id, suspended.id].sort(),
    "the lift restores eligibility with no profile write",
  );

  // Anonymized is the removal case, and the profile stays ACTIVE so the account
  // condition is what excludes it.
  await current.client.query("UPDATE users SET status = 'ANONYMIZED' WHERE id = $1", [suspended.userId]);
  const afterRemoval = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.deepEqual(suggestionIds(afterRemoval.body), [eligible.id], "an anonymized account is absent");
});

test("a dual-role account never suggests its own mentor profile", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Dual Role University");
  const student = await seedStudent(current, "suggest-dual@example.com", {
    institutionId: institution,
  });
  const granted = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, student.token);
  assert.equal(granted.status, 200, granted.text);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Student and mentor",
      bio: "Bio",
      expertise_summary: "Expertise",
      scope_statement: "Scope",
      primary_field: PRIMARY_FIELD,
      fields: [SHARED_FIELD],
      languages: ["EN"],
      weekly_capacity: 2,
    },
    student.token,
  );
  assert.equal(saved.status, 200, saved.text);
  await current.client.query(
    "UPDATE mentor_profiles SET status = 'ACTIVE' WHERE user_id = $1",
    [student.userId],
  );

  const suggestions = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(suggestions.status, 200, suggestions.text);
  assert.deepEqual(suggestionIds(suggestions.body), []);
});

test("the same student sees the same order twice", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Stable Order University");
  const student = await seedStudent(current, "suggest-stable@example.com", {
    institutionId: institution,
  });
  for (let index = 1; index <= 5; index += 1) {
    await seedMentor(current, `stable-${index}@example.com`, {
      institutionId: institution,
      department: "CSE",
      batchYear: 2020,
    });
  }

  const first = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  const second = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(first.status, 200);
  assert.deepEqual(suggestionIds(first.body), suggestionIds(second.body));
  assert.deepEqual(first.body, second.body);
});

test("a student with no availability and no affiliation still gets suggestions", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Sparse Data University");
  const student = await seedStudent(current, "suggest-sparse@example.com", {
    institutionId: null,
  });
  const mentor = await seedMentor(current, "sparse-mentor@example.com", {
    institutionId: institution,
    department: "CSE",
    batchYear: 2020,
  });

  const suggestions = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(suggestions.status, 200, suggestions.text);
  assert.deepEqual(suggestionIds(suggestions.body), [mentor.id]);
  const entry = (suggestions.body?.data as { limited_information: boolean; reasons: string[] }[])[0];
  assert.equal(entry.limited_information, true, "a missing factor is declared");
  assert.ok(entry.reasons.length >= 1);
});

test("a student without a student profile is refused with STUDENT_PROFILE_REQUIRED", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await seedStudent(current, "suggest-no-profile@example.com", {
    withProfile: false,
  });

  const response = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(response.status, 422, response.text);
  assert.equal(response.body?.code, "STUDENT_PROFILE_REQUIRED");
  assert.ok(!("data" in (response.body ?? {})));
});

test("no session is 401 and a mentor is refused with ROLE_REQUIRED", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const anonymous = await apiRequest(current, "GET", "/v1/suggestions");
  assert.equal(anonymous.status, 401);

  const mentorToken = await mentorTokenFor(current, "suggest-role-mentor@example.com");
  // Registration grants STUDENT to every account, so the only way to hold the
  // mentor role alone is to revoke the student one.
  await current.client.query(
    `UPDATE role_assignments SET revoked_at = now()
      WHERE role = 'STUDENT'
        AND user_id = (SELECT id FROM users WHERE email = $1)`,
    ["suggest-role-mentor@example.com"],
  );
  const refused = await apiRequest(current, "GET", "/v1/suggestions", undefined, mentorToken);
  assert.equal(refused.status, 403, refused.text);
  assert.equal(refused.body?.code, "ROLE_REQUIRED");
});

test("the candidate pool is bounded", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const institution = await seedInstitution(current, "Bound University");
  const student = await seedStudent(current, "suggest-bound@example.com", {
    institutionId: institution,
  });
  const field = await current.client.query<{ primary_field_id: string }>(
    "SELECT primary_field_id FROM student_profiles WHERE user_id = $1",
    [student.userId],
  );
  const fieldId = field.rows[0]?.primary_field_id;
  assert.ok(fieldId);

  await current.client.query(
    `INSERT INTO users (id, name, email, email_verified, status)
     SELECT 'bulk-' || i, 'Bulk Mentor ' || i, 'bulk' || i || '@example.com', true, 'ACTIVE'
       FROM generate_series(1, $1::int) AS i`,
    [SUGGESTION_POOL_LIMIT + 5],
  );
  await current.client.query(
    `INSERT INTO mentor_profiles
       (user_id, primary_field_id, status, headline, bio, expertise_summary,
        scope_statement, weekly_capacity, access_mode)
     SELECT 'bulk-' || i, $1::uuid, 'ACTIVE', 'Headline', 'Bio', 'Expertise', 'Scope', 2, 'OPEN'
       FROM generate_series(1, $2::int) AS i`,
    [fieldId, SUGGESTION_POOL_LIMIT + 5],
  );

  const profiles = new DrizzleProfilesService(current.database.db);
  const pool = await profiles.readSuggestionPool({ userId: student.userId });
  assert.equal(pool.candidates.length, SUGGESTION_POOL_LIMIT, "the scan is bounded");

  const response = await apiRequest(current, "GET", "/v1/suggestions", undefined, student.token);
  assert.equal(response.status, 200, response.text);
  assert.equal(((response.body?.data ?? []) as unknown[]).length, 5);
});
