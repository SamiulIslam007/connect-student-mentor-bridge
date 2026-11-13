import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { AttestationController } from "../src/institutions/attestation.controller.js";
import { ATTESTATIONS_SERVICE } from "../src/institutions/attestation.tokens.js";
import { DrizzleAttestationsService } from "../src/institutions/drizzle-attestation.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { grantMentorAgreements } from "./support/agreements.js";
import { truncateAll } from "./support/database.js";

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: [AuthController, MeRolesController, ProfilesController, AttestationController],
    requestIdRoutes: [AuthController, MeRolesController, ProfilesController, AttestationController],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: ATTESTATIONS_SERVICE, useValue: new DrizzleAttestationsService(database) },
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
    // truncateAll() leaves the outbox in place; a leaked row would falsify the
    // "exactly one notice" assertions.
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

/**
 * Enrolls a verified second factor without driving the TOTP flow. The flag the
 * API reads is `users.two_factor_enabled`, so both the row and the flag are set.
 */
async function enrollFactor(current: TestApiStack, userId: string): Promise<void> {
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [userId]);
  await current.client.query(
    "INSERT INTO two_factors (id, secret, backup_codes, user_id, verified) VALUES ($1, 'TEST-TOTP-SECRET', '[]', $2, true)",
    [`factor-${userId}`, userId],
  );
}

interface Admin {
  token: string;
  userId: string;
}

async function institutionAdmin(
  current: TestApiStack,
  email: string,
  institutionIds: string[],
  options: { mfa?: boolean } = {},
): Promise<Admin> {
  const token = await tokenFor(current, email);
  const userId = await userIdFor(current, email);
  for (const institutionId of institutionIds) {
    await current.client.query(
      "INSERT INTO role_assignments (user_id, role, institution_id) VALUES ($1, 'INSTITUTION_ADMIN', $2)",
      [userId, institutionId],
    );
  }
  if (options.mfa !== false) {
    await enrollFactor(current, userId);
  }
  return { token, userId };
}

async function platformAdmin(current: TestApiStack, email: string): Promise<Admin> {
  const token = await tokenFor(current, email);
  const userId = await userIdFor(current, email);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [userId],
  );
  await enrollFactor(current, userId);
  return { token, userId };
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

interface ClaimInput {
  userId: string;
  institutionId: string | null;
  status?: "PENDING" | "VERIFIED" | "REJECTED";
  kind?: "STUDENT" | "ALUMNUS" | "FACULTY_STAFF";
  department?: string | null;
  batchYear?: number | null;
  organizationName?: string | null;
}

async function seedClaim(current: TestApiStack, input: ClaimInput): Promise<string> {
  const status = input.status ?? "PENDING";
  const created = await current.client.query<{ id: string }>(
    `INSERT INTO affiliations
       (user_id, institution_id, organization_name, kind, department, batch_year,
        level, method, status, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'LEVEL_0', 'INSTITUTIONAL_EMAIL', $7, $8)
     RETURNING id`,
    [
      input.userId,
      input.institutionId,
      input.organizationName ?? null,
      input.kind ?? "ALUMNUS",
      input.department ?? "CSE",
      input.batchYear ?? 2022,
      status,
      status === "VERIFIED" ? new Date() : null,
    ],
  );
  const id = created.rows[0]?.id;
  assert.ok(id);
  return id;
}

const CLAIM_KEYS = [
  "batch_year",
  "claimed_at",
  "department",
  "display_name",
  "email_domain",
  "id",
  "kind",
  "program",
];

test("an institution admin reads only its own pending claims, with the fixed projection", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institutionA = await seedInstitution(current, "Attestation A");
  const institutionB = await seedInstitution(current, "Attestation B");
  const admin = await institutionAdmin(current, "admin-a@attestation.example", [institutionA]);

  await tokenFor(current, "applicant@student.attestation.example");
  const applicant = await userIdFor(current, "applicant@student.attestation.example");
  const own = await seedClaim(current, { userId: applicant, institutionId: institutionA });
  await seedClaim(current, { userId: applicant, institutionId: institutionB });
  await seedClaim(current, { userId: applicant, institutionId: institutionA, status: "VERIFIED" });
  await seedClaim(current, {
    userId: applicant,
    institutionId: null,
    organizationName: "Acme Ltd",
  });

  const queue = await apiRequest(current, "GET", "/v1/institution/affiliations", undefined, admin.token);
  assert.equal(queue.status, 200, queue.text);
  const rows = (queue.body?.data ?? []) as Record<string, unknown>[];
  assert.equal(rows.length, 1, "only the one pending claim of institution A");
  assert.equal(rows[0]?.id, own);
  assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), CLAIM_KEYS);
  assert.equal(rows[0]?.email_domain, "student.attestation.example");
  assert.ok(!queue.text.includes("applicant@"), "the email local part never leaves the API");
});

test("verification grants Level 1, revokes the earlier verified row, and queues one notice", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institutionA = await seedInstitution(current, "Verify A");
  const institutionB = await seedInstitution(current, "Verify B");
  const admin = await institutionAdmin(current, "admin-verify@attestation.example", [institutionA]);

  await tokenFor(current, "verify-applicant@student.attestation.example");
  const applicant = await userIdFor(current, "verify-applicant@student.attestation.example");
  await seedClaim(current, { userId: applicant, institutionId: institutionB, status: "VERIFIED" });
  const claim = await seedClaim(current, { userId: applicant, institutionId: institutionA });

  const response = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "verify", reason: "checked against the registrar" },
    admin.token,
  );
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body?.status, "verified");
  assert.equal(response.body?.level, "level_1");
  assert.equal(response.body?.method, "admin_attestation");

  const rows = await current.client.query<{
    status: string;
    level: string;
    method: string;
    decided_by_user_id: string | null;
    decision_reason: string | null;
    verified_at: Date | null;
  }>("SELECT status, level, method, decided_by_user_id, decision_reason, verified_at FROM affiliations WHERE id = $1", [
    claim,
  ]);
  assert.equal(rows.rows[0]?.status, "VERIFIED");
  assert.equal(rows.rows[0]?.level, "LEVEL_1");
  assert.equal(rows.rows[0]?.method, "ADMIN_ATTESTATION");
  assert.equal(rows.rows[0]?.decided_by_user_id, admin.userId);
  assert.equal(rows.rows[0]?.decision_reason, "checked against the registrar");
  assert.ok(rows.rows[0]?.verified_at);

  const verified = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM affiliations WHERE user_id = $1 AND status = 'VERIFIED'",
    [applicant],
  );
  assert.equal(verified.rows[0]?.count, "1", "exactly one verified row remains");

  const audits = await current.client.query<{ action: string; metadata: unknown }>(
    "SELECT action, metadata FROM audit_logs WHERE object_id::text = $1",
    [claim],
  );
  assert.equal(audits.rows.length, 1);
  assert.equal(audits.rows[0]?.action, "AFFILIATION_GRANTED");
  assert.ok(!JSON.stringify(audits.rows[0]?.metadata).includes("@"), "no email in metadata");

  const outbox = await current.client.query<{ payload: { template: string; text: string; to: string } }>(
    "SELECT payload FROM outbox_events WHERE dedupe_key = $1",
    [`email:affiliation-decided:${claim}`],
  );
  assert.equal(outbox.rows.length, 1, "exactly one queued notice");
  assert.equal(outbox.rows[0]?.payload.template, "affiliation-decided");
  assert.ok(outbox.rows[0]?.payload.text.includes("Verify A"), "the institution is named");
  assert.ok(!outbox.rows[0]?.payload.text.includes("admin-verify@"), "no reviewer identity");
});

test("a rejection needs its reason and grants no level", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Reject University");
  const admin = await institutionAdmin(current, "admin-reject@attestation.example", [institution]);
  await tokenFor(current, "reject-applicant@student.attestation.example");
  const applicant = await userIdFor(current, "reject-applicant@student.attestation.example");
  const claim = await seedClaim(current, { userId: applicant, institutionId: institution });

  const withoutReason = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "reject" },
    admin.token,
  );
  assert.equal(withoutReason.status, 422, withoutReason.text);
  assert.equal(withoutReason.body?.code, "VALIDATION_FAILED");

  const tooLong = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "reject", reason: "x".repeat(1001) },
    admin.token,
  );
  assert.equal(tooLong.status, 422);
  assert.match(String(tooLong.body?.detail), /1000 characters/);

  const rejected = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "reject", reason: "the registrar has no record" },
    admin.token,
  );
  assert.equal(rejected.status, 200, rejected.text);
  assert.equal(rejected.body?.status, "rejected");

  const row = await current.client.query<{ status: string; level: string }>(
    "SELECT status, level FROM affiliations WHERE id = $1",
    [claim],
  );
  assert.equal(row.rows[0]?.status, "REJECTED");
  assert.equal(row.rows[0]?.level, "LEVEL_0", "a rejection grants nothing");

  const audits = await current.client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE object_id::text = $1",
    [claim],
  );
  assert.deepEqual(
    audits.rows.map((entry) => entry.action),
    ["AFFILIATION_REJECTED"],
  );
});

test("a claim is decided exactly once", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Once University");
  const admin = await institutionAdmin(current, "admin-once@attestation.example", [institution]);
  await tokenFor(current, "once-applicant@student.attestation.example");
  const applicant = await userIdFor(current, "once-applicant@student.attestation.example");
  const claim = await seedClaim(current, { userId: applicant, institutionId: institution });

  const body = { decision: "reject", reason: "no record" };
  const first = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    body,
    admin.token,
  );
  assert.equal(first.status, 200, first.text);

  const second = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    body,
    admin.token,
  );
  assert.equal(second.status, 409, second.text);
  assert.equal(second.body?.code, "CLAIM_ALREADY_DECIDED");

  const audits = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM audit_logs WHERE object_id::text = $1",
    [claim],
  );
  assert.equal(audits.rows[0]?.count, "1", "the second decision wrote nothing");
});

test("a claim outside the caller's scope answers 404", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institutionA = await seedInstitution(current, "Scope A");
  const institutionB = await seedInstitution(current, "Scope B");
  const admin = await institutionAdmin(current, "admin-scope@attestation.example", [institutionA]);
  await tokenFor(current, "scope-applicant@student.attestation.example");
  const applicant = await userIdFor(current, "scope-applicant@student.attestation.example");
  const claimB = await seedClaim(current, { userId: applicant, institutionId: institutionB });

  const response = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claimB}/decide`,
    { decision: "verify", reason: "guess" },
    admin.token,
  );
  assert.equal(response.status, 404, response.text);

  const row = await current.client.query<{ status: string }>(
    "SELECT status FROM affiliations WHERE id = $1",
    [claimB],
  );
  assert.equal(row.rows[0]?.status, "PENDING", "nothing changed");
});

test("an institution admin cannot decide their own claim", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Self University");
  const admin = await institutionAdmin(current, "admin-self@attestation.example", [institution]);
  const claim = await seedClaim(current, { userId: admin.userId, institutionId: institution });

  const response = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "verify", reason: "mine" },
    admin.token,
  );
  assert.equal(response.status, 403, response.text);
  assert.equal(response.body?.code, "FORBIDDEN");

  const row = await current.client.query<{ status: string }>(
    "SELECT status FROM affiliations WHERE id = $1",
    [claim],
  );
  assert.equal(row.rows[0]?.status, "PENDING");

  const audits = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM audit_logs WHERE object_id::text = $1",
    [claim],
  );
  assert.equal(audits.rows[0]?.count, "0", "a refusal leaves no audit entry");
});

test("verification activates a mentor who then holds Level 1 and a factor", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Activation University");
  const admin = await institutionAdmin(current, "admin-activate@attestation.example", [institution]);

  const mentorToken = await tokenFor(current, "pending-mentor@attestation.example");
  const granted = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, mentorToken);
  assert.equal(granted.status, 200, granted.text);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Backend engineer",
      bio: "Eight years building APIs.",
      expertise_summary: "API design",
      scope_statement: "I can review design docs.",
      primary_field: "Software engineering",
      fields: [],
      languages: ["EN"],
      weekly_capacity: 2,
    },
    mentorToken,
  );
  assert.equal(saved.status, 200, saved.text);

  const mentorId = await userIdFor(current, "pending-mentor@attestation.example");
  await grantMentorAgreements(current.client, mentorId);
  await enrollFactor(current, mentorId);
  const claim = await seedClaim(current, {
    userId: mentorId,
    institutionId: institution,
    kind: "FACULTY_STAFF",
  });

  const before = await current.client.query<{ status: string }>(
    "SELECT status FROM mentor_profiles WHERE user_id = $1",
    [mentorId],
  );
  assert.notEqual(before.rows[0]?.status, "ACTIVE", "a claim alone does not activate");

  const response = await apiRequest(
    current,
    "POST",
    `/v1/institution/affiliations/${claim}/decide`,
    { decision: "verify", reason: "faculty list confirms it" },
    admin.token,
  );
  assert.equal(response.status, 200, response.text);

  const after = await current.client.query<{ status: string }>(
    "SELECT status FROM mentor_profiles WHERE user_id = $1",
    [mentorId],
  );
  assert.equal(after.rows[0]?.status, "ACTIVE");
});

test("a platform admin grants institution-admin, once, with one audit entry", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Grant University");
  const platform = await platformAdmin(current, "platform@attestation.example");
  await tokenFor(current, "grant-target@attestation.example");
  const target = await userIdFor(current, "grant-target@attestation.example");

  const body = { email: "grant-target@attestation.example" };
  const grant = await apiRequest(
    current,
    "POST",
    `/v1/admin/institutions/${institution}/admins`,
    body,
    platform.token,
  );
  assert.equal(grant.status, 200, grant.text);
  assert.deepEqual(grant.body?.roles, ["STUDENT", "INSTITUTION_ADMIN"]);

  const rows = await current.client.query<{ institution_id: string }>(
    "SELECT institution_id FROM role_assignments WHERE user_id = $1 AND role = 'INSTITUTION_ADMIN' AND revoked_at IS NULL",
    [target],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]?.institution_id, institution);

  const audits = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM audit_logs WHERE action = 'ROLE_GRANTED' AND object_id::text IN (SELECT id::text FROM role_assignments WHERE user_id = $1)",
    [target],
  );
  assert.equal(audits.rows[0]?.count, "1");

  const repeat = await apiRequest(
    current,
    "POST",
    `/v1/admin/institutions/${institution}/admins`,
    body,
    platform.token,
  );
  assert.equal(repeat.status, 200, repeat.text);
  const auditsAfter = await current.client.query<{ count: string }>(
    "SELECT count(*) FROM audit_logs WHERE action = 'ROLE_GRANTED' AND object_id::text IN (SELECT id::text FROM role_assignments WHERE user_id = $1)",
    [target],
  );
  assert.equal(auditsAfter.rows[0]?.count, "1", "a repeat writes no second entry");
});

test("the grant route refuses an unknown email, an unknown institution and the wrong role", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Grant Refusal University");
  const platform = await platformAdmin(current, "platform-refuse@attestation.example");
  const institutionAdminToken = await institutionAdmin(
    current,
    "admin-refuse@attestation.example",
    [institution],
  );

  const unknownEmail = await apiRequest(
    current,
    "POST",
    `/v1/admin/institutions/${institution}/admins`,
    { email: "nobody@attestation.example" },
    platform.token,
  );
  assert.equal(unknownEmail.status, 422, unknownEmail.text);

  const unknownInstitution = await apiRequest(
    current,
    "POST",
    "/v1/admin/institutions/00000000-0000-0000-0000-000000000000/admins",
    { email: "admin-refuse@attestation.example" },
    platform.token,
  );
  assert.equal(unknownInstitution.status, 404, unknownInstitution.text);

  const wrongRole = await apiRequest(
    current,
    "POST",
    `/v1/admin/institutions/${institution}/admins`,
    { email: "admin-refuse@attestation.example" },
    institutionAdminToken.token,
  );
  assert.equal(wrongRole.status, 403, wrongRole.text);
  assert.equal(wrongRole.body?.code, "ROLE_REQUIRED");
});

test("the institution routes refuse an anonymous caller, a mentor, and a factor-less admin", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const institution = await seedInstitution(current, "Refusal University");
  const anonymous = await apiRequest(current, "GET", "/v1/institution/affiliations");
  assert.equal(anonymous.status, 401);

  const mentorToken = await tokenFor(current, "refusal-mentor@attestation.example");
  await userIdFor(current, "refusal-mentor@attestation.example");
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) SELECT id, 'MENTOR' FROM users WHERE email = $1",
    ["refusal-mentor@attestation.example"],
  );
  await current.client.query(
    "UPDATE role_assignments SET revoked_at = now() WHERE role = 'STUDENT' AND user_id = (SELECT id FROM users WHERE email = $1)",
    ["refusal-mentor@attestation.example"],
  );
  const mentor = await apiRequest(current, "GET", "/v1/institution/affiliations", undefined, mentorToken);
  assert.equal(mentor.status, 403, mentor.text);

  const noFactor = await institutionAdmin(current, "admin-nofactor@attestation.example", [institution], {
    mfa: false,
  });
  const refused = await apiRequest(
    current,
    "GET",
    "/v1/institution/affiliations",
    undefined,
    noFactor.token,
  );
  assert.equal(refused.status, 403, refused.text);
  assert.equal(refused.body?.code, "MFA_REQUIRED");

  const malformed = await apiRequest(
    current,
    "POST",
    "/v1/institution/affiliations/not-a-uuid/decide",
    { decision: "verify", reason: "x" },
    (await institutionAdmin(current, "admin-baduuid@attestation.example", [institution])).token,
  );
  assert.equal(malformed.status, 422, malformed.text);
});
