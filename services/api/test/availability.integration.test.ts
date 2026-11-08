import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AvailabilityController } from "../src/availability/availability.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AVAILABILITY_SERVICE } from "../src/availability/availability.tokens.js";
import { DrizzleAvailabilityService } from "../src/availability/drizzle-availability.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
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
    controllers: [AuthController, MeController, MeRolesController, ProfilesController, AvailabilityController],
    requestIdRoutes: [
      AuthController,
      MeController,
      MeRolesController,
      ProfilesController,
      AvailabilityController,
    ],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
      { provide: AVAILABILITY_SERVICE, useValue: new DrizzleAvailabilityService(database) },
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

function window(
  weekday: number,
  startMinute: number,
  endMinute: number,
  timezone = "Asia/Dhaka",
): Record<string, unknown> {
  return { weekday, start_minute: startMinute, end_minute: endMinute, timezone };
}

test("a save is readable back and a later save replaces the set", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "avail-save@example.com");

  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", windows: [window(1, 540, 660), window(3, 600, 720)] },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(
    (saved.body?.windows as { weekday: number }[]).map((entry) => entry.weekday),
    [1, 3],
  );

  const replaced = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", windows: [window(2, 480, 540)] },
    token,
  );
  assert.equal(replaced.status, 200, replaced.text);

  const read = await apiRequest(current, "GET", "/v1/me/availability?context=STUDENT", undefined, token);
  assert.equal(read.status, 200, read.text);
  assert.deepEqual(read.body?.windows, [
    { id: (replaced.body?.windows as { id: string }[])[0].id, context: "STUDENT", weekday: 2, start_minute: 480, end_minute: 540, timezone: "Asia/Dhaka" },
  ]);
});

test("contexts are independent and empty clears only its own context", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await mentorTokenFor(current, "avail-context@example.com");
  await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", windows: [window(1, 540, 600)] },
    token,
  );
  await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "MENTOR", windows: [window(4, 900, 960)] },
    token,
  );

  const cleared = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "MENTOR", windows: [] },
    token,
  );
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body?.windows, []);

  const student = await apiRequest(
    current,
    "GET",
    "/v1/me/availability?context=STUDENT",
    undefined,
    token,
  );
  assert.equal((student.body?.windows as unknown[]).length, 1, "the other context is untouched");
});

test("windows come back ordered by weekday, then start, then end", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "avail-order@example.com");
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    {
      context: "STUDENT",
      windows: [window(5, 600, 660), window(1, 720, 780), window(1, 600, 660), window(1, 540, 600)],
    },
    token,
  );

  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(
    (saved.body?.windows as { weekday: number; start_minute: number; end_minute: number }[]).map(
      (entry) => [entry.weekday, entry.start_minute, entry.end_minute],
    ),
    [
      [1, 540, 600],
      [1, 600, 660],
      [1, 720, 780],
      [5, 600, 660],
    ],
  );
});

test("a refused save keeps the previous set", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "avail-refused@example.com");
  await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", windows: [window(1, 540, 600)] },
    token,
  );

  for (const bad of [
    { context: "STUDENT", windows: [window(1, 600, 600)] },
    { context: "STUDENT", windows: [window(1, 540, 660), window(1, 600, 700)] },
    { context: "STUDENT", windows: [window(1, 540, 600, "Mars/Olympus")] },
    { context: "STUDENT", windows: [window(8, 540, 600)] },
  ]) {
    const refused = await apiRequest(current, "PUT", "/v1/me/availability", bad, token);
    assert.equal(refused.status, 422, `${JSON.stringify(bad)} must be refused`);
  }

  const read = await apiRequest(current, "GET", "/v1/me/availability?context=STUDENT", undefined, token);
  assert.deepEqual(
    (read.body?.windows as { start_minute: number; end_minute: number }[]).map((entry) => [
      entry.start_minute,
      entry.end_minute,
    ]),
    [[540, 600]],
  );
});

test("a body user id writes only the caller's windows", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const caller = await tokenFor(current, "avail-caller@example.com");
  await registerAndVerify(current, "avail-target@example.com");
  const target = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'avail-target@example.com'",
  );
  const callerId = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'avail-caller@example.com'",
  );

  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", user_id: target.rows[0]?.id, windows: [window(1, 540, 600)] },
    caller,
  );
  assert.equal(saved.status, 200, saved.text);

  const rows = await current.client.query<{ user_id: string }>(
    "SELECT user_id FROM availability_windows",
  );
  assert.deepEqual(rows.rows, [{ user_id: callerId.rows[0]?.id }]);
});

test("the mentor context needs the mentor role and the student context does not", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const studentToken = await tokenFor(current, "avail-student@example.com");

  const refused = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "MENTOR", windows: [window(1, 540, 600)] },
    studentToken,
  );
  assert.equal(refused.status, 403, refused.text);
  assert.equal(refused.body?.code, "ROLE_REQUIRED");

  const refusedRead = await apiRequest(
    current,
    "GET",
    "/v1/me/availability?context=MENTOR",
    undefined,
    studentToken,
  );
  assert.equal(refusedRead.status, 403);

  const studentSave = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "STUDENT", windows: [window(1, 540, 600)] },
    studentToken,
  );
  assert.equal(studentSave.status, 200, studentSave.text);
});

test("the context is required and must be one of the two values", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "avail-context-invalid@example.com");
  const missing = await apiRequest(current, "GET", "/v1/me/availability", undefined, token);
  assert.equal(missing.status, 422);

  const invalid = await apiRequest(
    current,
    "PUT",
    "/v1/me/availability",
    { context: "PARENT", windows: [] },
    token,
  );
  assert.equal(invalid.status, 422);
});

test("the database refuses an out-of-range weekday for the application role", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  await registerAndVerify(current, "avail-db@example.com");
  const user = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'avail-db@example.com'",
  );

  await current.client.query("BEGIN");
  try {
    await current.client.query("SET LOCAL ROLE connect_app");
    const inserted = await current.client.query(
      "INSERT INTO availability_windows (user_id, context, weekday, start_minute, end_minute, timezone) VALUES ($1, 'STUDENT', 1, 540, 600, 'Asia/Dhaka') RETURNING id",
      [user.rows[0]?.id],
    );
    const id = (inserted.rows[0] as { id: string }).id;
    await current.client.query("UPDATE availability_windows SET end_minute = 610 WHERE id = $1", [id]);
    await current.client.query("DELETE FROM availability_windows WHERE id = $1", [id]);

    await assert.rejects(
      current.client.query(
        "INSERT INTO availability_windows (user_id, context, weekday, start_minute, end_minute, timezone) VALUES ($1, 'STUDENT', 8, 540, 600, 'Asia/Dhaka')",
        [user.rows[0]?.id],
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "23514", "a check constraint refuses it");
        return true;
      },
    );
  } finally {
    await current.client.query("ROLLBACK");
  }
});
