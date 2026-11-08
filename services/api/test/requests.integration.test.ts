import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AffiliationsController } from "../src/affiliations/affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { DrizzleRequestsService } from "../src/requests/drizzle-requests.service.js";
import { RequestsController } from "../src/requests/requests.controller.js";
import { REQUESTS_SERVICE } from "../src/requests/requests.tokens.js";
import { sweepRequests } from "../src/requests/request-sweeper.js";
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
  ];
  const started = await startApiStack({
    controllers,
    requestIdRoutes: controllers,
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
      { provide: REQUESTS_SERVICE, useValue: new DrizzleRequestsService(database) },
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
  options: { capacity?: number; accessMode?: "OPEN" | "APPLICATION_ONLY" } = {},
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
      ...(options.accessMode ? { access_mode: options.accessMode } : {}),
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
  const enrolledToken = String(verified.body?.session_token);

  const id = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )
  ).rows[0].id;
  return { token: enrolledToken, profileId: id };
}

function requestBody(mentorId: string, overrides: Record<string, unknown> = {}) {
  return {
    mentor_id: mentorId,
    question: "How do I prepare for an internship interview?",
    context_summary: "Final-year CSE student with two projects.",
    target_outcome: "Pass a technical interview",
    expected_timeframe: "WITHIN_1_MONTH",
    ...overrides,
  };
}

async function createRequest(
  current: TestApiStack,
  token: string,
  mentorId: string,
  overrides: Record<string, unknown> = {},
) {
  return await apiRequest(current, "POST", "/v1/requests", requestBody(mentorId, overrides), token);
}

test("a valid request is created pending with 48h expiry and the mentor is queued once", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "student@example.com");
  const mentor = await activeMentor(current, "mentor@example.edu.bd");

  const created = await createRequest(current, student, mentor.profileId);
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.status, "pending");
  assert.match(String(created.body?.expires_at), /^\d{4}-/);
  const hours = (new Date(String(created.body?.expires_at)).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 47.5 && hours < 48.5, `expiry is 48 hours out (got ${hours})`);

  const event = await current.client.query<{ event_type: string; dedupe_key: string }>(
    "SELECT event_type, dedupe_key FROM outbox_events",
  );
  assert.deepEqual(event.rows, [
    { event_type: "EmailRequested", dedupe_key: `email:request-received:${created.body?.id}` },
  ]);

  const me = await apiRequest(current, "GET", "/v1/requests?role=sent", undefined, student);
  assert.equal(me.status, 200);
  assert.equal((me.body?.data as unknown[]).length, 1);
});

test("missing, group, and over-length fields are refused with nothing written", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "invalid.student@example.com");
  const mentor = await activeMentor(current, "invalid.mentor@example.edu.bd");

  for (const overrides of [
    { question: "" },
    { interaction_type: "GROUP_OFFICE_HOURS" },
    { context_summary: "x".repeat(2_001) },
    { target_outcome: "x".repeat(301) },
  ]) {
    const response = await createRequest(current, student, mentor.profileId, overrides);
    assert.equal(response.status, 422, `${JSON.stringify(overrides)} → ${response.text}`);
  }
  assert.equal((await current.client.query("SELECT id FROM mentorship_requests")).rowCount, 0);
});

test("a self-request is refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const mentor = await activeMentor(current, "self.mentor@example.edu.bd");
  await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { goals: "Self", primary_field: "Engineering" },
    mentor.token,
  );
  const response = await createRequest(current, mentor.token, mentor.profileId);
  assert.equal(response.status, 422, response.text);
  assert.match(String(response.body?.detail), /yourself/);
});

test("a mentor below Level 1 is refused as unverified", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "level0.student@example.com");
  const token = await tokenFor(current, "level0.mentor@example.edu.bd");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
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
  assert.equal(saved.status, 200);
  const mentorId = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'level0.mentor@example.edu.bd')",
    )
  ).rows[0].id;

  const response = await createRequest(current, student, mentorId);
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body?.code, "MENTOR_NOT_VERIFIED");
});

test("a verified mentor without a second factor is not operating", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "pending.student@example.com");
  const token = await tokenFor(current, "pending.mentor@example.edu.bd");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  await apiRequest(
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
  await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token);
  const mentorId = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'pending.mentor@example.edu.bd')",
    )
  ).rows[0].id;

  const response = await createRequest(current, student, mentorId);
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body?.code, "MENTOR_UNAVAILABLE");
});

test("a paused mentor is unavailable", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "pause.student@example.com");
  const mentor = await activeMentor(current, "pause.mentor@example.edu.bd");
  assert.equal(
    (await apiRequest(current, "POST", "/v1/me/mentor-profile/pause", undefined, mentor.token)).status,
    200,
  );
  const response = await createRequest(current, student, mentor.profileId);
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body?.code, "MENTOR_UNAVAILABLE");
});

test("application-only needs a note, and with one the request is created", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "apply.student@example.com");
  const mentor = await activeMentor(current, "apply.mentor@example.edu.bd", {
    accessMode: "APPLICATION_ONLY",
  });

  const refused = await createRequest(current, student, mentor.profileId);
  assert.equal(refused.status, 422, refused.text);
  assert.match(String(refused.body?.detail), /application_note/);
  assert.equal((await current.client.query("SELECT id FROM mentorship_requests")).rowCount, 0);

  const created = await createRequest(current, student, mentor.profileId, {
    application_note: "I built two projects on this stack.",
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.application_note, "I built two projects on this stack.");
});

test("a duplicate pending request is refused and a fourth pending hits the cap", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "limit.student@example.com");
  const first = await activeMentor(current, "limit1.mentor@example.edu.bd");

  assert.equal((await createRequest(current, student, first.profileId)).status, 201);
  const duplicate = await createRequest(current, student, first.profileId);
  assert.equal(duplicate.status, 409, duplicate.text);
  assert.equal(duplicate.body?.code, "DUPLICATE_PENDING_REQUEST");

  for (const email of ["limit2.mentor@example.edu.bd", "limit3.mentor@example.edu.bd"]) {
    const mentor = await activeMentor(current, email);
    assert.equal((await createRequest(current, student, mentor.profileId)).status, 201);
  }
  const fourth = await activeMentor(current, "limit4.mentor@example.edu.bd");
  const refused = await createRequest(current, student, fourth.profileId);
  assert.equal(refused.status, 409, refused.text);
  assert.equal(refused.body?.code, "REQUEST_LIMIT_REACHED");
});

test("capacity is counted and two concurrent submissions cannot overshoot it", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const mentor = await activeMentor(current, "cap.mentor@example.edu.bd", { capacity: 1 });
  const one = await studentWithProfile(current, "cap1.student@example.com");
  const two = await studentWithProfile(current, "cap2.student@example.com");

  const [a, b] = await Promise.all([
    createRequest(current, one, mentor.profileId),
    createRequest(current, two, mentor.profileId),
  ]);
  assert.deepEqual(
    [a.status, b.status].sort((x, y) => x - y),
    [201, 409],
    `one create wins the only slot: ${a.text} / ${b.text}`,
  );
  assert.equal((await current.client.query("SELECT id FROM mentorship_requests")).rowCount, 1);
});

test("the addressee accepts once, and a non-addressee is refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "accept.student@example.com");
  const mentor = await activeMentor(current, "accept.mentor@example.edu.bd");
  const other = await activeMentor(current, "other.mentor@example.edu.bd");
  const created = await createRequest(current, student, mentor.profileId);
  const id = String((created.body as Record<string, unknown>).id);

  const foreign = await apiRequest(current, "POST", `/v1/requests/${id}/accept`, undefined, other.token);
  assert.equal(foreign.status, 403, foreign.text);

  const accepted = await apiRequest(current, "POST", `/v1/requests/${id}/accept`, undefined, mentor.token);
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.body?.status, "accepted");
  assert.ok(accepted.body?.decided_at);

  const decision = await current.client.query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM outbox_events WHERE dedupe_key LIKE 'email:request-decided:%'",
  );
  assert.deepEqual(decision.rows, [{ dedupe_key: `email:request-decided:${id}` }]);

  const again = await apiRequest(current, "POST", `/v1/requests/${id}/accept`, undefined, mentor.token);
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body?.code, "REQUEST_INVALID_STATE");
});

test("declining stores the reason", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "decline.student@example.com");
  const mentor = await activeMentor(current, "decline.mentor@example.edu.bd");
  const created = await createRequest(current, student, mentor.profileId);
  const id = String((created.body as Record<string, unknown>).id);

  const declined = await apiRequest(
    current,
    "POST",
    `/v1/requests/${id}/decline`,
    { reason: "Outside my scope right now." },
    mentor.token,
  );
  assert.equal(declined.status, 200, declined.text);
  assert.equal(declined.body?.status, "declined");
  assert.equal(declined.body?.decision_note, "Outside my scope right now.");
});

test("withdrawing frees the slot and a decided request cannot be withdrawn", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const mentor = await activeMentor(current, "withdraw.mentor@example.edu.bd", { capacity: 1 });
  const one = await studentWithProfile(current, "withdraw1.student@example.com");
  const two = await studentWithProfile(current, "withdraw2.student@example.com");

  const created = await createRequest(current, one, mentor.profileId);
  const id = String((created.body as Record<string, unknown>).id);
  assert.equal((await createRequest(current, two, mentor.profileId)).status, 409);

  const withdrawn = await apiRequest(current, "POST", `/v1/requests/${id}/withdraw`, undefined, one);
  assert.equal(withdrawn.status, 200, withdrawn.text);
  assert.equal(withdrawn.body?.status, "withdrawn");
  assert.equal(
    (await createRequest(current, two, mentor.profileId)).status,
    201,
    "the freed slot is usable",
  );

  const again = await apiRequest(current, "POST", `/v1/requests/${id}/withdraw`, undefined, one);
  assert.equal(again.status, 409);
  assert.equal(again.body?.code, "REQUEST_INVALID_STATE");
});

test("lists are paginated without repeats and a foreign request reads as 404", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "list.student@example.com");
  const mentors = [];
  for (const email of ["list1.mentor@example.edu.bd", "list2.mentor@example.edu.bd", "list3.mentor@example.edu.bd"]) {
    mentors.push(await activeMentor(current, email));
  }
  for (const mentor of mentors) {
    assert.equal((await createRequest(current, student, mentor.profileId)).status, 201);
  }

  const first = await apiRequest(
    current,
    "GET",
    "/v1/requests?role=sent&limit=2",
    undefined,
    student,
  );
  assert.equal(first.status, 200);
  const firstPage = first.body?.data as { id: string }[];
  assert.equal(firstPage.length, 2);
  const cursor = String(first.body?.next_cursor);
  assert.ok(cursor);

  const second = await apiRequest(
    current,
    "GET",
    `/v1/requests?role=sent&limit=2&cursor=${encodeURIComponent(cursor)}`,
    undefined,
    student,
  );
  const secondPage = second.body?.data as { id: string }[];
  assert.equal(secondPage.length, 1);
  assert.equal(
    new Set([...firstPage, ...secondPage].map((row) => row.id)).size,
    3,
    "no row repeats or drops across pages",
  );

  const received = await apiRequest(
    current,
    "GET",
    "/v1/requests?role=received",
    undefined,
    mentors[0].token,
  );
  assert.equal((received.body?.data as unknown[]).length, 1);

  const foreign = await apiRequest(current, "GET", `/v1/requests/${firstPage[0].id}`, undefined, mentors[1].token);
  assert.equal(foreign.status, 404, foreign.text);
});

test("the sweeper reminds once at 24h, expires at 48h, and leaves a decided request alone", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "sweep.student@example.com");
  const mentor = await activeMentor(current, "sweep.mentor@example.edu.bd");
  const other = await activeMentor(current, "sweep2.mentor@example.edu.bd");

  const reminded = await createRequest(current, student, mentor.profileId);
  const expired = await createRequest(current, student, other.profileId);
  assert.equal(reminded.status, 201, reminded.text);
  assert.equal(expired.status, 201, expired.text);

  const remindedId = String((reminded.body as Record<string, unknown>).id);
  const expiredId = String((expired.body as Record<string, unknown>).id);
  await current.client.query(
    "UPDATE mentorship_requests SET created_at = now() - interval '25 hours', expires_at = now() + interval '23 hours' WHERE id = $1",
    [remindedId],
  );
  await current.client.query(
    "UPDATE mentorship_requests SET created_at = now() - interval '49 hours', expires_at = now() - interval '1 hour' WHERE id = $1",
    [expiredId],
  );

  const first = await sweepRequests(current.database.db);
  assert.deepEqual(first, { reminded: 1, expired: 1 });
  const byId = new Map(
    (
      await current.client.query<{ id: string; status: string; reminder_sent_at: Date | null }>(
        "SELECT id, status, reminder_sent_at FROM mentorship_requests",
      )
    ).rows.map((row) => [row.id, row]),
  );
  assert.ok(byId.get(remindedId)?.reminder_sent_at);
  assert.equal(byId.get(remindedId)?.status, "PENDING");
  assert.equal(byId.get(expiredId)?.status, "EXPIRED");

  const second = await sweepRequests(current.database.db);
  assert.deepEqual(second, { reminded: 0, expired: 0 });
  const events = await current.client.query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM outbox_events WHERE dedupe_key LIKE 'email:request-reminder:%' OR dedupe_key LIKE 'email:request-expired:%'",
  );
  assert.deepEqual(events.rows.map((row) => row.dedupe_key).sort(), [
    `email:request-expired:${expiredId}`,
    `email:request-reminder:${remindedId}`,
  ]);
});

test("a requestable mentor's context is readable; a draft mentor is not", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const student = await studentWithProfile(current, "ctx.student@example.com");
  const mentor = await activeMentor(current, "ctx.mentor@example.edu.bd");

  const mentorContext = await apiRequest(current, "GET", `/v1/mentors/${mentor.profileId}`, undefined, student);
  assert.equal(mentorContext.status, 200, mentorContext.text);
  assert.equal(mentorContext.body?.access_mode, "OPEN");
  assert.equal(mentorContext.body?.status, "ACTIVE");
  assert.ok(mentorContext.body?.display_name);

  const draftToken = await tokenFor(current, "draft.mentor@example.edu.bd");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, draftToken);
  await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Draft",
      bio: "Bio",
      expertise_summary: "Summary",
      scope_statement: "Scope",
      primary_field: "Engineering",
      weekly_capacity: 2,
    },
    draftToken,
  );
  const draftId = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'draft.mentor@example.edu.bd')",
    )
  ).rows[0].id;
  assert.equal(
    (await apiRequest(current, "GET", `/v1/mentors/${draftId}`, undefined, student)).status,
    404,
  );
});

test("a body user_id cannot create a request for another account", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await studentWithProfile(current, "owner.student@example.com");
  const caller = await studentWithProfile(current, "caller.student@example.com");
  const otherId = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = 'owner.student@example.com'",
    )
  ).rows[0].id;
  const mentor = await activeMentor(current, "body.mentor@example.edu.bd");

  const created = await createRequest(current, caller, mentor.profileId, { user_id: otherId });
  assert.equal(created.status, 201, created.text);
  const owners = await current.client.query(
    "SELECT id FROM mentorship_requests WHERE student_profile_id = (SELECT id FROM student_profiles WHERE user_id = $1)",
    [otherId],
  );
  assert.equal(owners.rowCount, 0);
});
