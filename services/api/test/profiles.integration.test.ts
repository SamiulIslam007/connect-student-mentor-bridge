import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
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
    controllers: [AuthController, MeController, ProfilesController],
    requestIdRoutes: [AuthController, MeController, ProfilesController],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
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

async function userIdFor(current: TestApiStack, email: string): Promise<string> {
  const result = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  assert.ok(result.rows[0], `${email} must exist`);
  return result.rows[0].id;
}

const validMentor = {
  headline: "Backend engineer at a payments company",
  bio: "Eight years building APIs.",
  expertise_summary: "API design, databases",
  scope_statement: "I can review design docs, not write production code for you.",
  primary_field: "Software engineering",
  fields: ["Databases"],
  languages: ["EN"],
  weekly_capacity: 2,
};

test("a mentor profile is created and its additional fields are replaced", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "mentor@example.com");

  const created = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    { ...validMentor, fields: ["Databases", "Security"] },
    token,
  );
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body?.weekly_capacity, 2);
  assert.deepEqual(
    (created.body?.fields as { name: string }[]).map((field) => field.name),
    ["Databases", "Security"],
  );

  const replaced = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    { ...validMentor, fields: ["Distributed systems"] },
    token,
  );
  assert.equal(replaced.status, 200, replaced.text);
  assert.deepEqual(
    (replaced.body?.fields as { name: string }[]).map((field) => field.name),
    ["Distributed systems"],
  );

  const linked = await current.client.query("SELECT field_id FROM mentor_fields");
  assert.equal(linked.rowCount, 1, "the removed additional fields are gone");
  const profiles = await current.client.query("SELECT id FROM mentor_profiles");
  assert.equal(profiles.rowCount, 1, "the save replaces rather than duplicates");
});

test("weekly capacity accepts 1 and 5 and refuses everything else", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "capacity@example.com");

  for (const capacity of [1, 5]) {
    const saved = await apiRequest(
      current,
      "PUT",
      "/v1/me/mentor-profile",
      { ...validMentor, weekly_capacity: capacity },
      token,
    );
    assert.equal(saved.status, 200, `capacity ${capacity} is accepted: ${saved.text}`);
  }

  for (const capacity of [0, 6, 2.5, "3"]) {
    const refused = await apiRequest(
      current,
      "PUT",
      "/v1/me/mentor-profile",
      { ...validMentor, weekly_capacity: capacity },
      token,
    );
    assert.equal(refused.status, 422, `capacity ${String(capacity)} is refused`);
  }

  const stored = await current.client.query<{ weekly_capacity: number }>(
    "SELECT weekly_capacity FROM mentor_profiles",
  );
  assert.deepEqual(stored.rows, [{ weekly_capacity: 5 }], "the refused saves changed nothing");
});

test("a refused mentor save leaves no orphan field", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "atomic@example.com");

  const refused = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    { ...validMentor, primary_field: "Quantum basket weaving", weekly_capacity: 6 },
    token,
  );
  assert.equal(refused.status, 422);

  const fields = await current.client.query("SELECT id FROM fields");
  assert.equal(fields.rowCount, 0, "no field was created");
  const profiles = await current.client.query("SELECT id FROM mentor_profiles");
  assert.equal(profiles.rowCount, 0);
});

test("an empty required mentor field is refused", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "blank@example.com");

  const refused = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    { ...validMentor, headline: "   " },
    token,
  );
  assert.equal(refused.status, 422);
  assert.match(String(refused.body?.detail), /headline is required/);
});

test("GET /v1/fields lists active fields only, sorted, and needs a session", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "taxonomy@example.com");

  const empty = await apiRequest(current, "GET", "/v1/fields", undefined, token);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, { fields: [] });

  const withoutSession = await apiRequest(current, "GET", "/v1/fields");
  assert.equal(withoutSession.status, 401);
  assert.equal(withoutSession.body?.fields, undefined);

  assert.equal(
    (await apiRequest(current, "PUT", "/v1/me/student-profile", validStudent, token)).status,
    200,
  );
  const listed = await apiRequest(current, "GET", "/v1/fields", undefined, token);
  assert.equal(listed.status, 200);
  const names = (listed.body?.fields as { name: string }[]).map((field) => field.name);
  assert.deepEqual(names, ["AI", "Data science"]);

  // Retirement hides a field from the list but never breaks an existing reference.
  await current.client.query("UPDATE fields SET status = 'RETIRED' WHERE normalized_slug = 'ai'");
  const afterRetire = await apiRequest(current, "GET", "/v1/fields", undefined, token);
  assert.deepEqual(
    (afterRetire.body?.fields as { name: string }[]).map((field) => field.name),
    ["Data science"],
  );

  const savedAgain = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    validStudent,
    token,
  );
  assert.equal(savedAgain.status, 200, savedAgain.text);
  assert.deepEqual(
    (savedAgain.body?.interest_fields as { name: string }[]).map((field) => field.name),
    ["AI"],
    "the retired field is still readable through the profile",
  );
});

test("GET /v1/me returns both profiles and ignores account-level body properties", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "both@example.com");

  const student = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, account_status: "SUSPENDED", display_name: "Changed Name" },
    token,
  );
  assert.equal(student.status, 200, student.text);
  const mentor = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    { ...validMentor, account_status: "SUSPENDED", display_name: "Changed Name" },
    token,
  );
  assert.equal(mentor.status, 200, mentor.text);

  const me = await apiRequest(current, "GET", "/v1/me", undefined, token);
  assert.equal(me.status, 200);
  assert.equal(me.body?.account_status, "active", "the account status was not assigned");
  assert.equal(me.body?.display_name, "Rahim Uddin", "the display name was not assigned");

  const studentProfile = me.body?.student_profile as Record<string, unknown>;
  assert.equal(studentProfile.goals, validStudent.goals);
  assert.deepEqual(
    (studentProfile.interest_fields as { name: string }[]).map((field) => field.name),
    ["AI"],
  );
  const mentorProfile = me.body?.mentor_profile as Record<string, unknown>;
  assert.equal(mentorProfile.weekly_capacity, 2);
  assert.equal(mentorProfile.headline, validMentor.headline);

  const stored = await current.client.query<{ status: string; name: string }>(
    "SELECT status, name FROM users WHERE email = $1",
    ["both@example.com"],
  );
  assert.deepEqual(stored.rows[0], { status: "ACTIVE", name: "Rahim Uddin" });
});

const validStudent = {
  goals: "Become a backend engineer",
  primary_field: "Data science",
  interest_fields: ["AI"],
  languages: ["EN"],
};

test("a student profile is created with create-on-save fields", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "student@example.com");
  const userId = await userIdFor(current, "student@example.com");

  const saved = await apiRequest(current, "PUT", "/v1/me/student-profile", validStudent, token);
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body?.goals, "Become a backend engineer");
  assert.deepEqual(saved.body?.languages, ["en"]);
  assert.deepEqual(
    (saved.body?.interest_fields as { name: string }[]).map((field) => field.name),
    ["AI"],
  );
  assert.equal((saved.body?.primary_field as { name: string }).name, "Data science");

  const fields = await current.client.query<{ name: string; normalized_slug: string }>(
    "SELECT name, normalized_slug FROM fields ORDER BY normalized_slug",
  );
  assert.deepEqual(fields.rows, [
    { name: "AI", normalized_slug: "ai" },
    { name: "Data science", normalized_slug: "data science" },
  ]);
  const owner = await current.client.query<{ created_by_user_id: string }>(
    "SELECT created_by_user_id FROM fields WHERE normalized_slug = 'data science'",
  );
  assert.equal(owner.rows[0].created_by_user_id, userId);
});

test("a second spelling of the same field reuses the row and keeps the display name", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const first = await tokenFor(current, "first@example.com");
  const second = await tokenFor(current, "second@example.com");

  assert.equal(
    (await apiRequest(current, "PUT", "/v1/me/student-profile", validStudent, first)).status,
    200,
  );
  const again = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, primary_field: "DATA-SCIENCE" },
    second,
  );
  assert.equal(again.status, 200, again.text);

  const fields = await current.client.query<{ name: string }>(
    "SELECT name FROM fields WHERE normalized_slug = 'data science'",
  );
  assert.deepEqual(fields.rows, [{ name: "Data science" }]);
});

test("saving a student profile replaces its interest fields", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "replace@example.com");

  assert.equal(
    (
      await apiRequest(
        current,
        "PUT",
        "/v1/me/student-profile",
        { ...validStudent, interest_fields: ["AI", "Databases"] },
        token,
      )
    ).status,
    200,
  );
  const replaced = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, interest_fields: ["Security"] },
    token,
  );
  assert.equal(replaced.status, 200, replaced.text);
  assert.deepEqual(
    (replaced.body?.interest_fields as { name: string }[]).map((field) => field.name),
    ["Security"],
  );

  const linked = await current.client.query(
    "SELECT field_id FROM student_field_interests",
  );
  assert.equal(linked.rowCount, 1, "the removed interests are gone");
});

test("profile saves need a session and write nothing without one", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const response = await apiRequest(current, "PUT", "/v1/me/student-profile", validStudent);
  assert.equal(response.status, 401);
  assert.equal(response.body?.code, "UNAUTHENTICATED");

  const counts = await current.client.query<{ profiles: number; fields: number }>(
    "SELECT (SELECT count(*) FROM student_profiles)::int AS profiles, (SELECT count(*) FROM fields)::int AS fields",
  );
  assert.deepEqual(counts.rows[0], { profiles: 0, fields: 0 });
});

test("a body user_id is ignored: only the caller's profile is written", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "owner@example.com");
  await registerAndVerify(current, "other@example.com");
  const otherId = await userIdFor(current, "other@example.com");

  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, user_id: otherId },
    token,
  );
  assert.equal(saved.status, 200, saved.text);

  const profiles = await current.client.query<{ user_id: string }>(
    "SELECT user_id FROM student_profiles",
  );
  assert.equal(profiles.rowCount, 1);
  assert.notEqual(profiles.rows[0].user_id, otherId);
});

test("a refused save returns 422 with a request id and creates no field", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "invalid@example.com");

  const refused = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, goals: "   ", primary_field: "Brand new field" },
    token,
  );
  assert.equal(refused.status, 422);
  assert.equal(refused.body?.code, "VALIDATION_FAILED");
  assert.match(String(refused.body?.request_id), /^[0-9a-f-]{36}$/);

  const fields = await current.client.query("SELECT id FROM fields");
  assert.equal(fields.rowCount, 0, "no orphan field");
  const profiles = await current.client.query("SELECT id FROM student_profiles");
  assert.equal(profiles.rowCount, 0);
});

test("three interest fields are refused and leave nothing behind", async (context) => {
  const current = requireStack(context);
  if (!current) {
    return;
  }
  const token = await tokenFor(current, "interests@example.com");

  const refused = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { ...validStudent, interest_fields: ["A", "B", "C"] },
    token,
  );
  assert.equal(refused.status, 422);

  const counts = await current.client.query<{ profiles: number; fields: number }>(
    "SELECT (SELECT count(*) FROM student_profiles)::int AS profiles, (SELECT count(*) FROM fields)::int AS fields",
  );
  assert.deepEqual(counts.rows[0], { profiles: 0, fields: 0 });
});
