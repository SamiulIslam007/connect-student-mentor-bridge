import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { AdminThreadController } from "../src/mentorships/admin-thread.controller.js";
import { DrizzleMentorshipService } from "../src/mentorships/drizzle-mentorship.service.js";
import { MentorshipsController, SessionsController } from "../src/mentorships/mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "../src/mentorships/mentorships.tokens.js";
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
    controllers: [AuthController, MentorshipsController, SessionsController, AdminThreadController],
    requestIdRoutes: [
      AuthController,
      MentorshipsController,
      SessionsController,
      AdminThreadController,
    ],
    providers: (database) => [
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
  if (stack) {
    await truncateAll(stack.client);
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

interface Seed {
  mentorshipId: string;
  studentToken: string;
  mentorToken: string;
  studentUserId: string;
  mentorUserId: string;
}

async function tokenFor(current: TestApiStack, email: string): Promise<{ token: string; userId: string }> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  const user = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  assert.ok(user.rows[0], `${email} must exist`);
  return { token: String(signedIn.body?.session_token), userId: user.rows[0].id };
}

/** A mentorship between two verified accounts, with two messages and one session. */
async function seedThread(current: TestApiStack): Promise<Seed> {
  const { client } = current;
  const student = await tokenFor(current, "thread-student@example.com");
  const mentor = await tokenFor(current, "thread-mentor@example.com");

  const field = await client.query<{ id: string }>(
    "INSERT INTO fields (name, normalized_slug, created_by_user_id) VALUES ('Thread field', 'thread field', $1) RETURNING id",
    [mentor.userId],
  );
  const studentProfile = await client.query<{ id: string }>(
    "INSERT INTO student_profiles (user_id, goals, primary_field_id) VALUES ($1, 'Goals', $2) RETURNING id",
    [student.userId, field.rows[0].id],
  );
  const mentorProfile = await client.query<{ id: string }>(
    `INSERT INTO mentor_profiles
       (user_id, primary_field_id, status, onboarding_status, headline, bio, expertise_summary,
        scope_statement, weekly_capacity)
     VALUES ($1, $2, 'ACTIVE', 'AFFILIATION_VERIFIED', 'Headline', 'Bio', 'Expertise', 'Scope', 2)
     RETURNING id`,
    [mentor.userId, field.rows[0].id],
  );
  const request = await client.query<{ id: string }>(
    `INSERT INTO mentorship_requests
       (student_profile_id, mentor_profile_id, field_id, question, context_summary, target_outcome,
        timeframe, expires_at)
     VALUES ($1, $2, $3, 'Question', 'Context', 'Outcome', 'WITHIN_1_MONTH', now() + interval '2 days')
     RETURNING id`,
    [studentProfile.rows[0].id, mentorProfile.rows[0].id, field.rows[0].id],
  );
  const mentorship = await client.query<{ id: string }>(
    `INSERT INTO mentorships
       (request_id, student_profile_id, mentor_profile_id, field_id, status, cadence, planned_weeks,
        goal, started_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', 'WEEKLY', 4, 'Get an internship', now())
     RETURNING id`,
    [request.rows[0].id, studentProfile.rows[0].id, mentorProfile.rows[0].id, field.rows[0].id],
  );
  const mentorshipId = String(mentorship.rows[0]?.id);

  // Distinct timestamps: one statement would share `now()` and the tie-break
  // would be a random uuid.
  await client.query(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body, created_at) VALUES ($1, $2, 'First message', now() - interval '2 minutes')",
    [mentorshipId, student.userId],
  );
  await client.query(
    "INSERT INTO thread_messages (mentorship_id, sender_user_id, body, created_at) VALUES ($1, $2, 'Second message', now() - interval '1 minute')",
    [mentorshipId, mentor.userId],
  );
  await client.query(
    `INSERT INTO mentorship_sessions
       (mentorship_id, created_by_user_id, scheduled_start, duration_minutes, meeting_url, status)
     VALUES ($1, $2, now() + interval '1 day', 45, 'https://meet.example.com/abc', 'SCHEDULED')`,
    [mentorshipId, mentor.userId],
  );

  return {
    mentorshipId,
    studentToken: student.token,
    mentorToken: mentor.token,
    studentUserId: student.userId,
    mentorUserId: mentor.userId,
  };
}

async function platformAdmin(
  current: TestApiStack,
  email: string,
  options: { mfa?: boolean } = {},
): Promise<string> {
  const account = await tokenFor(current, email);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [account.userId],
  );
  if (options.mfa !== false) {
    await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [
      account.userId,
    ]);
    await current.client.query(
      "INSERT INTO two_factors (id, secret, backup_codes, user_id, verified) VALUES ($1, 'TEST-TOTP-SECRET', '[]', $2, true)",
      [`factor-${account.userId}`, account.userId],
    );
  }
  return account.token;
}

async function auditRows(
  current: TestApiStack,
): Promise<{ action: string; break_glass: boolean; reason: string | null; object_id: string | null; actor: string | null }[]> {
  const result = await current.client.query<{
    action: string;
    break_glass: boolean;
    reason: string | null;
    object_id: string | null;
    actor_user_id: string | null;
  }>(
    "SELECT action, break_glass, reason, object_id, actor_user_id FROM audit_logs WHERE action = 'THREAD_BREAK_GLASS_READ'",
  );
  return result.rows.map((row) => ({
    action: row.action,
    break_glass: row.break_glass,
    reason: row.reason,
    object_id: row.object_id,
    actor: row.actor_user_id,
  }));
}

function breakGlassPath(mentorshipId: string): string {
  return `/v1/admin/mentorships/${mentorshipId}/break-glass-read`;
}

test("a platform admin reads the thread, the agreement and the sessions, and one audit row exists", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const seed = await seedThread(current);
  const admin = await platformAdmin(current, "reader@example.com");
  const adminUser = await current.client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'reader@example.com'",
  );

  const response = await apiRequest(
    current,
    "POST",
    breakGlassPath(seed.mentorshipId),
    { reason: "  the reporter named this message  " },
    admin,
  );

  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(response.body ?? {}).sort(), [
    "agreement",
    "mentorship_id",
    "messages",
    "sessions",
    "status",
  ]);
  assert.equal(response.body?.mentorship_id, seed.mentorshipId);
  assert.equal(response.body?.status, "active");

  const messages = response.body?.messages as Record<string, unknown>[];
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((message) => message.body), ["First message", "Second message"]);
  for (const message of messages) {
    assert.deepEqual(Object.keys(message).sort(), [
      "body",
      "created_at",
      "id",
      "sender_name",
      "sender_user_id",
    ]);
  }

  const sessions = response.body?.sessions as Record<string, unknown>[];
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.duration_minutes, 45);

  const agreement = response.body?.agreement as Record<string, unknown>;
  assert.equal(agreement.goal, "Get an internship");
  assert.equal(agreement.planned_weeks, 4);
  assert.equal(agreement.agreement_acknowledged, false);

  const serialised = JSON.stringify(response.body);
  assert.doesNotMatch(serialised, /@/, "no email address anywhere in the payload");
  assert.doesNotMatch(serialised, /outcome|LinkedIn|interview at/i, "no outcome text");

  const audits = await auditRows(current);
  assert.equal(audits.length, 1, "exactly one audit row");
  assert.equal(audits[0]?.break_glass, true);
  assert.equal(audits[0]?.reason, "the reporter named this message");
  assert.equal(audits[0]?.object_id, seed.mentorshipId);
  assert.equal(audits[0]?.actor, adminUser.rows[0]?.id);
});

test("every refusal returns no content and writes no audit row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const seed = await seedThread(current);
  const admin = await platformAdmin(current, "admin-refusals@example.com");
  const noFactor = await platformAdmin(current, "admin-nofactor@example.com", { mfa: false });

  const institutionAdmin = await tokenFor(current, "institution-refused@example.com");
  const institution = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ('Refusal University', 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
  );
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role, institution_id) VALUES ($1, 'INSTITUTION_ADMIN', $2)",
    [institutionAdmin.userId, institution.rows[0]?.id],
  );
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [
    institutionAdmin.userId,
  ]);
  await current.client.query(
    "INSERT INTO two_factors (id, secret, backup_codes, user_id, verified) VALUES ($1, 'TEST-TOTP-SECRET', '[]', $2, true)",
    [`factor-${institutionAdmin.userId}`, institutionAdmin.userId],
  );

  const cases: { name: string; token?: string; body: unknown; status: number; code?: string }[] = [
    { name: "anonymous", body: { reason: "why" }, status: 401 },
    { name: "no reason", token: admin, body: {}, status: 422 },
    { name: "empty reason", token: admin, body: { reason: "   " }, status: 422 },
    { name: "reason of 1001 characters", token: admin, body: { reason: "x".repeat(1001) }, status: 422 },
    { name: "mentor caller", token: seed.mentorToken, body: { reason: "why" }, status: 403, code: "ROLE_REQUIRED" },
    {
      name: "institution admin caller",
      token: institutionAdmin.token,
      body: { reason: "why" },
      status: 403,
      code: "ROLE_REQUIRED",
    },
    {
      name: "platform admin without a second factor",
      token: noFactor,
      body: { reason: "why" },
      status: 403,
      code: "MFA_REQUIRED",
    },
    {
      name: "unknown mentorship",
      token: admin,
      body: { reason: "why" },
      status: 404,
    },
  ];

  for (const probe of cases) {
    const response = await apiRequest(
      current,
      "POST",
      probe.name === "unknown mentorship"
        ? breakGlassPath("11111111-1111-1111-1111-111111111111")
        : breakGlassPath(seed.mentorshipId),
      probe.body,
      probe.token,
    );
    assert.equal(response.status, probe.status, `${probe.name}: ${response.text}`);
    if (probe.code) {
      assert.equal(response.body?.code, probe.code, probe.name);
    }
    assert.equal("messages" in (response.body ?? {}), false, `${probe.name} returns no messages`);
    assert.equal("sessions" in (response.body ?? {}), false, `${probe.name} returns no sessions`);
    assert.equal((await auditRows(current)).length, 0, `${probe.name} writes no audit row`);
  }
});

test("the reason bound is stated in the refusal message", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const seed = await seedThread(current);
  const admin = await platformAdmin(current, "admin-bound@example.com");

  const response = await apiRequest(
    current,
    "POST",
    breakGlassPath(seed.mentorshipId),
    { reason: "x".repeat(1001) },
    admin,
  );

  assert.equal(response.status, 422);
  assert.match(String(response.body?.detail ?? ""), /1000/);
});

test("the participant read is unchanged, including its 404 for a third account", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const seed = await seedThread(current);
  const outsider = await tokenFor(current, "outsider@example.com");

  const participant = await apiRequest(
    current,
    "GET",
    `/v1/mentorships/${seed.mentorshipId}/messages`,
    undefined,
    seed.studentToken,
  );
  assert.equal(participant.status, 200, participant.text);
  assert.equal(((participant.body?.data ?? []) as unknown[]).length, 2);

  const third = await apiRequest(
    current,
    "GET",
    `/v1/mentorships/${seed.mentorshipId}/messages`,
    undefined,
    outsider.token,
  );
  assert.equal(third.status, 404, "a third account still reads as not found");
});
