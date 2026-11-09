import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { requireRole } from "../src/authorization/authorize.js";
import type { RequestWithId } from "../src/http/request-id.middleware.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
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
  const started = await startApiStack({
    controllers: [AuthController, MeController, MeRolesController, ProfilesController],
    requestIdRoutes: [AuthController, MeController, MeRolesController, ProfilesController],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
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

/** base32 secret from the enrollment URI, then a current TOTP code for it. */
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

async function roleRows(current: TestApiStack, userId: string): Promise<string[]> {
  const result = await current.client.query<{ role: string }>(
    "SELECT role FROM role_assignments WHERE user_id = $1 AND revoked_at IS NULL ORDER BY role",
    [userId],
  );
  return result.rows.map((row) => row.role);
}

async function auditCount(current: TestApiStack, action: string): Promise<number> {
  const result = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = $1",
    [action],
  );
  return Number(result.rows[0]?.count ?? "0");
}

test("registration writes one STUDENT assignment in the same transaction", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  await registerAndVerify(current, "default@example.com");
  const userId = await userIdFor(current, "default@example.com");

  assert.deepEqual(await roleRows(current, userId), ["STUDENT"]);
  const assignment = await current.client.query<{ granted_by_user_id: string | null }>(
    "SELECT granted_by_user_id FROM role_assignments WHERE user_id = $1",
    [userId],
  );
  assert.equal(assignment.rows.length, 1);
  assert.equal(assignment.rows[0].granted_by_user_id, null, "a system grant has no actor");
});

test("the mentor role is granted once, audited once, and repeats change nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "mentor-role@example.com");
  const userId = await userIdFor(current, "mentor-role@example.com");

  const first = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body?.roles, ["STUDENT", "MENTOR"]);
  assert.deepEqual(await roleRows(current, userId), ["STUDENT", "MENTOR"]);
  assert.equal(await auditCount(current, "ROLE_GRANTED"), 1);

  const repeat = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  assert.equal(repeat.status, 200, repeat.text);
  assert.deepEqual(repeat.body?.roles, ["STUDENT", "MENTOR"]);
  assert.deepEqual(await roleRows(current, userId), ["STUDENT", "MENTOR"]);
  assert.equal(await auditCount(current, "ROLE_GRANTED"), 1, "a repeat is not audited");

  const audit = await current.client.query<{ actor_user_id: string | null; metadata: unknown }>(
    "SELECT actor_user_id, metadata FROM audit_logs WHERE action = 'ROLE_GRANTED'",
  );
  assert.equal(audit.rows[0]?.actor_user_id, userId);
  assert.deepEqual(audit.rows[0]?.metadata, { role: "MENTOR" });
});

test("GET /v1/me returns the caller's own roles only", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const mentorToken = await tokenFor(current, "roles-mentor@example.com");
  const studentToken = await tokenFor(current, "roles-student@example.com");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, mentorToken);

  const mentorMe = await apiRequest(current, "GET", "/v1/me", undefined, mentorToken);
  const studentMe = await apiRequest(current, "GET", "/v1/me", undefined, studentToken);

  assert.deepEqual(mentorMe.body?.roles, ["STUDENT", "MENTOR"]);
  assert.deepEqual(studentMe.body?.roles, ["STUDENT"]);
  assert.ok(!studentMe.text.includes("MENTOR"), "no other account's roles");
});

test("a body user_id is refused and grants no role", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const callerToken = await tokenFor(current, "grant-caller@example.com");
  await tokenFor(current, "grant-target@example.com");
  const targetId = await userIdFor(current, "grant-target@example.com");
  const callerId = await userIdFor(current, "grant-caller@example.com");

  const response = await apiRequest(
    current,
    "POST",
    "/v1/me/roles/mentor",
    { user_id: targetId, userId: targetId, role: "PLATFORM_ADMIN", roles: ["PLATFORM_ADMIN"] },
    callerToken,
  );
  assert.equal(response.status, 422, response.text);
  assert.equal(response.body?.code, "VALIDATION_FAILED");
  assert.match(String(response.body?.detail), /unknown property: /);

  assert.deepEqual(await roleRows(current, callerId), ["STUDENT"]);
  assert.deepEqual(await roleRows(current, targetId), ["STUDENT"], "the target is untouched");
});

test("saving a mentor profile without the role is refused and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "no-role@example.com");
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Backend engineer",
      bio: "Eight years of APIs.",
      expertise_summary: "API design",
      scope_statement: "Design reviews only.",
      primary_field: "Software engineering",
      fields: [],
      languages: ["EN"],
      weekly_capacity: 2,
    },
    token,
  );

  assert.equal(saved.status, 403, saved.text);
  assert.equal(saved.body?.code, "ROLE_REQUIRED");
  const rows = await current.client.query("SELECT id FROM mentor_profiles");
  assert.equal(rows.rowCount, 0, "no profile is written for a refused save");
});

test("a revocation applies to the next request without a re-sign-in", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "revoked@example.com");
  const granted = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  assert.equal(granted.status, 200);
  const userId = await userIdFor(current, "revoked@example.com");

  const body = {
    headline: "Backend engineer",
    bio: "Eight years of APIs.",
    expertise_summary: "API design",
    scope_statement: "Design reviews only.",
    primary_field: "Software engineering",
    fields: [],
    languages: ["EN"],
    weekly_capacity: 2,
  };
  const before = await apiRequest(current, "PUT", "/v1/me/mentor-profile", body, token);
  assert.equal(before.status, 200, before.text);

  await current.client.query(
    "UPDATE role_assignments SET revoked_at = now() WHERE user_id = $1 AND role = 'MENTOR'",
    [userId],
  );

  const after = await apiRequest(current, "PUT", "/v1/me/mentor-profile", body, token);
  assert.equal(after.status, 403, after.text);
  assert.equal(after.body?.code, "ROLE_REQUIRED");

  const me = await apiRequest(current, "GET", "/v1/me", undefined, token);
  assert.deepEqual(me.body?.roles, ["STUDENT"]);
});

test("requireRole refuses MFA_REQUIRED without a factor and serves an enrolled account", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const token = await tokenFor(current, "mfa-policy@example.com");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);

  const request = (sessionToken: string): RequestWithId =>
    ({ headers: { authorization: `Bearer ${sessionToken}` }, requestId: "req-mfa" }) as RequestWithId;

  await assert.rejects(
    requireRole(current.identity, request(token), "MENTOR", { requiresMfa: true }),
    { code: "MFA_REQUIRED" },
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

  const acting = await requireRole(current.identity, request(enrolledToken), "MENTOR", {
    requiresMfa: true,
  });
  assert.deepEqual(acting.roles, ["STUDENT", "MENTOR"]);
});

test("the role alone grants no visibility and no profile", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const mentorToken = await tokenFor(current, "bare-mentor@example.com");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, mentorToken);
  const otherToken = await tokenFor(current, "other-viewer@example.com");

  const otherMe = await apiRequest(current, "GET", "/v1/me", undefined, otherToken);
  assert.equal(otherMe.body?.mentor_profile, null);
  assert.deepEqual(otherMe.body?.roles, ["STUDENT"]);

  const ownMe = await apiRequest(current, "GET", "/v1/me", undefined, mentorToken);
  assert.equal(ownMe.body?.mentor_profile, null, "a role is not a profile");
});
