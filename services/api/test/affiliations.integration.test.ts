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
  ];
  const started = await startApiStack({
    controllers,
    requestIdRoutes: controllers,
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
    await stack.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");
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
  assert.equal(signedIn.status, 200, signedIn.text);
  return String(signedIn.body?.session_token);
}

async function userIdFor(current: TestApiStack, email: string): Promise<string> {
  const result = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  assert.ok(result.rows[0], `${email} must exist`);
  return result.rows[0].id;
}

async function createInstitution(
  current: TestApiStack,
  name: string,
  domains: string[],
): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ($1, 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
    [name],
  );
  const id = created.rows[0].id;
  for (const domain of domains) {
    await current.client.query(
      "INSERT INTO institution_domains (institution_id, domain) VALUES ($1, $2)",
      [id, domain],
    );
  }
  return id;
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

async function enrollSecondFactor(current: TestApiStack, token: string): Promise<string> {
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
  return String(verified.body?.session_token);
}

async function saveMentorProfile(current: TestApiStack, token: string): Promise<void> {
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Headline",
      bio: "Bio",
      expertise_summary: "Summary",
      scope_statement: "Scope",
      primary_field: "Software engineering",
      weekly_capacity: 2,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
}

test("a verified institutional email claims Level 1 and GET /v1/me reports it", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Claim University", ["example.edu.bd"]);
  const token = await tokenFor(current, "claim.student@example.edu.bd");

  const claimed = await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "STUDENT" }, token);
  assert.equal(claimed.status, 200, claimed.text);
  const affiliation = claimed.body?.affiliation as Record<string, unknown>;
  assert.equal(affiliation.level, "level_1");
  assert.equal(affiliation.method, "institutional_email");
  assert.equal(affiliation.status, "verified");
  assert.deepEqual(affiliation.institution, {
    id: (await current.client.query<{ id: string }>("SELECT id FROM institutions")).rows[0].id,
    name: "Claim University",
  });

  const me = await apiRequest(current, "GET", "/v1/me", undefined, token);
  assert.equal(me.status, 200);
  const reported = me.body?.affiliations as Record<string, unknown>[];
  assert.equal(reported.length, 1);
  assert.equal(reported[0].level, "level_1");

  const audit = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'AFFILIATION_GRANTED'",
  );
  assert.equal(audit.rows[0].count, "1");
});

test("GET /v1/me lists no affiliation for an unaffiliated caller", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "unaffiliated@example.com");
  const me = await apiRequest(current, "GET", "/v1/me", undefined, token);
  assert.equal(me.status, 200);
  assert.deepEqual(me.body?.affiliations, []);
});

test("an unregistered domain is stored pending and grants no Level 1", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Other University", ["other.edu.bd"]);
  const token = await tokenFor(current, "pending.student@example.edu.bd");
  const institutionId = (
    await current.client.query<{ id: string }>("SELECT id FROM institutions WHERE name = 'Other University'")
  ).rows[0].id;

  const claimed = await apiRequest(
    current,
    "POST",
    "/v1/me/affiliations",
    { kind: "STUDENT", institution_id: institutionId },
    token,
  );
  assert.equal(claimed.status, 200, claimed.text);
  const affiliation = claimed.body?.affiliation as Record<string, unknown>;
  assert.equal(affiliation.level, "level_0");
  assert.equal(affiliation.status, "pending");
  assert.equal(claimed.body?.level, "level_0");
});

test("an unknown institution is refused and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "unknown.institution@example.com");

  const claimed = await apiRequest(
    current,
    "POST",
    "/v1/me/affiliations",
    { kind: "STUDENT", institution_id: "00000000-0000-0000-0000-000000000000" },
    token,
  );
  assert.equal(claimed.status, 422, claimed.text);
  assert.equal(claimed.body?.code, "AFFILIATION_INSTITUTION_MISMATCH");
  assert.equal((await current.client.query("SELECT id FROM affiliations")).rowCount, 0);
});

test("an unverified email is refused and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Unverified University", ["example.edu.bd"]);
  const token = await tokenFor(current, "unverified.claim@example.edu.bd");
  // Sign-in requires a verified address, so the drift is produced directly.
  await current.client.query("UPDATE users SET email_verified = false WHERE email = $1", [
    "unverified.claim@example.edu.bd",
  ]);

  const claimed = await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "STUDENT" }, token);
  assert.equal(claimed.status, 422, claimed.text);
  assert.equal(claimed.body?.code, "AFFILIATION_EMAIL_UNVERIFIED");
  assert.equal((await current.client.query("SELECT id FROM affiliations")).rowCount, 0);
});

test("the same claim twice returns the existing row and one audit entry", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Repeat University", ["example.edu.bd"]);
  const token = await tokenFor(current, "repeat.claim@example.edu.bd");

  const first = await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "STUDENT" }, token);
  const second = await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "STUDENT" }, token);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(
    (first.body?.affiliation as Record<string, unknown>).id,
    (second.body?.affiliation as Record<string, unknown>).id,
  );
  assert.equal((await current.client.query("SELECT id FROM affiliations")).rowCount, 1);
  const audit = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'AFFILIATION_GRANTED'",
  );
  assert.equal(audit.rows[0].count, "1");
});

test("a claim for another institution revokes the earlier verified row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "First University", ["example.edu.bd"]);
  const secondId = await createInstitution(current, "Second University", ["second.edu.bd"]);
  const token = await tokenFor(current, "supersede.student@example.edu.bd");

  await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "STUDENT" }, token);
  const superseded = await apiRequest(
    current,
    "POST",
    "/v1/me/affiliations",
    { kind: "ALUMNUS", institution_id: secondId },
    token,
  );
  assert.equal(superseded.status, 200, superseded.text);
  assert.equal((superseded.body?.affiliation as Record<string, unknown>).status, "pending");

  const rows = await current.client.query<{ status: string; revoked_at: Date | null }>(
    "SELECT status, revoked_at FROM affiliations ORDER BY created_at",
  );
  assert.deepEqual(
    rows.rows.map((row) => ({ status: row.status, revoked: row.revoked_at !== null })),
    [
      { status: "REVOKED", revoked: true },
      { status: "PENDING", revoked: false },
    ],
  );
  const audit = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'AFFILIATION_REVOKED'",
  );
  assert.equal(audit.rows[0].count, "1");
});

test("a body user_id and identity documents are refused and never stored", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Ignore University", ["example.edu.bd"]);
  const caller = await tokenFor(current, "ignore.caller@example.edu.bd");
  await tokenFor(current, "ignore.other@example.edu.bd");
  const otherId = await userIdFor(current, "ignore.other@example.edu.bd");

  const claimed = await apiRequest(
    current,
    "POST",
    "/v1/me/affiliations",
    { kind: "STUDENT", user_id: otherId, nid: "1234567890123", passport_number: "BX1234567" },
    caller,
  );
  assert.equal(claimed.status, 422, claimed.text);
  assert.equal(claimed.body?.code, "VALIDATION_FAILED");
  assert.match(String(claimed.body?.detail), /unknown property: /);

  const otherRows = await current.client.query("SELECT id FROM affiliations WHERE user_id = $1", [
    otherId,
  ]);
  assert.equal(otherRows.rowCount, 0, "the other account is untouched");
  const anyRows = await current.client.query("SELECT id FROM affiliations");
  assert.equal(anyRows.rowCount, 0, "a refused body writes nothing");

  const leaked = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM affiliations WHERE row_to_json(affiliations)::text LIKE '%1234567890123%' OR row_to_json(affiliations)::text LIKE '%BX1234567%'",
  );
  assert.equal(leaked.rows[0].count, "0");
  const auditLeak = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE metadata::text LIKE '%1234567890123%' OR metadata::text LIKE '%BX1234567%'",
  );
  assert.equal(auditLeak.rows[0].count, "0");
});

test("a new mentor profile is DRAFT/APPLIED; Level 1 makes it PENDING, a factor makes it ACTIVE", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Activation University", ["example.edu.bd"]);
  const token = await tokenFor(current, "activation.mentor@example.edu.bd");
  assert.equal((await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token)).status, 200);
  await saveMentorProfile(current, token);

  const initial = await apiRequest(current, "GET", "/v1/me", undefined, token);
  const draft = initial.body?.mentor_profile as Record<string, unknown>;
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.onboarding_status, "APPLIED");

  const claimed = await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token);
  assert.equal(claimed.status, 200, claimed.text);
  const pending = await apiRequest(current, "GET", "/v1/me", undefined, token);
  const pendingProfile = pending.body?.mentor_profile as Record<string, unknown>;
  assert.equal(pendingProfile.status, "PENDING");
  assert.equal(pendingProfile.onboarding_status, "AFFILIATION_VERIFIED");

  const enrolledToken = await enrollSecondFactor(current, token);
  const active = await apiRequest(current, "GET", "/v1/me", undefined, enrolledToken);
  const activeProfile = active.body?.mentor_profile as Record<string, unknown>;
  assert.equal(activeProfile.status, "ACTIVE");
  const activated = await current.client.query<{ activated_at: Date | null }>(
    "SELECT activated_at FROM mentor_profiles WHERE user_id = $1",
    [await userIdFor(current, "activation.mentor@example.edu.bd")],
  );
  assert.ok(activated.rows[0].activated_at, "activation sets activated_at");

  const disabled = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/disable",
    { password: TEST_PASSWORD },
    enrolledToken,
  );
  assert.equal(disabled.status, 200, disabled.text);
  const afterDisable = await apiRequest(
    current,
    "GET",
    "/v1/me",
    undefined,
    String(disabled.body?.session_token),
  );
  assert.equal((afterDisable.body?.mentor_profile as Record<string, unknown>).status, "PENDING");
  const kept = await current.client.query<{ activated_at: Date | null; changed: boolean }>(
    "SELECT activated_at, activated_at IS NOT NULL AS changed FROM mentor_profiles WHERE user_id = $1",
    [await userIdFor(current, "activation.mentor@example.edu.bd")],
  );
  assert.equal(kept.rows[0].changed, true, "activated_at keeps its first value");
});

test("granting the mentor role recomputes an existing profile", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await createInstitution(current, "Regrant University", ["example.edu.bd"]);
  const token = await tokenFor(current, "regrant.mentor@example.edu.bd");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
  await saveMentorProfile(current, token);
  const enrolledToken = await enrollSecondFactor(current, token);
  await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, enrolledToken);

  const userId = await userIdFor(current, "regrant.mentor@example.edu.bd");
  // Put the profile back into a state the role grant can change.
  await current.client.query("UPDATE role_assignments SET revoked_at = now() WHERE user_id = $1", [
    userId,
  ]);
  await current.client.query("UPDATE mentor_profiles SET status = 'PENDING' WHERE user_id = $1", [
    userId,
  ]);

  const granted = await apiRequest(
    current,
    "POST",
    "/v1/me/roles/mentor",
    undefined,
    enrolledToken,
  );
  assert.equal(granted.status, 200, granted.text);
  const profile = await current.client.query<{ status: string }>(
    "SELECT status FROM mentor_profiles WHERE user_id = $1",
    [userId],
  );
  assert.equal(profile.rows[0].status, "ACTIVE");
});
