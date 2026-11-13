import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { ConsentController } from "../src/consent/consent.controller.js";
import { DrizzleConsentService } from "../src/consent/drizzle-consent.service.js";
import { CONSENT_SERVICE } from "../src/consent/consent.tokens.js";
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

const CONTROLLERS = [AuthController, MeController, MeRolesController, ProfilesController, ConsentController];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      { provide: CONSENT_SERVICE, useValue: new DrizzleConsentService(database) },
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

async function createMentorProfile(current: TestApiStack, token: string): Promise<void> {
  assert.equal((await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token)).status, 200);
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

async function createInstitution(current: TestApiStack, name: string): Promise<string> {
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO institutions (name, kind, country_code, status) VALUES ($1, 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
    [name],
  );
  return created.rows[0].id;
}

test("the own consent read returns all five purposes with the registration's two grants", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "reader@example.com");

  const read = await apiRequest(current, "GET", "/v1/me/consents", undefined, token);
  assert.equal(read.status, 200, read.text);
  const body = read.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["institutions", "purposes"]);

  const purposes = body.purposes as Record<string, unknown>[];
  assert.equal(purposes.length, 5, "five purposes, no sixth");
  assert.deepEqual(Object.keys(purposes[0]).sort(), [
    "accepted_version",
    "action",
    "current_version",
    "institution_id",
    "purpose",
  ]);
  const byPurpose = new Map(purposes.map((entry) => [String(entry.purpose), entry]));
  assert.equal(byPurpose.get("TERMS")?.accepted_version, CONSENT_DOCUMENT_VERSION);
  assert.equal(byPurpose.get("PRIVACY_NOTICE")?.accepted_version, CONSENT_DOCUMENT_VERSION);
  assert.equal(byPurpose.get("VOLUNTEER_AGREEMENT")?.accepted_version, null);
  assert.equal(byPurpose.get("VOLUNTEER_AGREEMENT")?.action, null);
  assert.equal(byPurpose.get("INSTITUTION_DATA_SHARING")?.institution_id, null);

  // No other account's rows leak in: a second account's grant changes nothing here.
  const otherToken = await tokenFor(current, "other@example.com");
  const granted = await apiRequest(
    current,
    "POST",
    "/v1/me/consents",
    { purpose: "VOLUNTEER_AGREEMENT", action: "GRANTED", document_version: CONSENT_DOCUMENT_VERSION },
    otherToken,
  );
  assert.equal(granted.status, 200, granted.text);
  const reread = await apiRequest(current, "GET", "/v1/me/consents", undefined, token);
  const rereadEntry = (reread.body?.purposes as Record<string, unknown>[]).find(
    (entry) => entry.purpose === "VOLUNTEER_AGREEMENT",
  );
  assert.equal(rereadEntry?.accepted_version, null, "another account's grant is invisible");
});

test("a volunteer agreement grant stamps the orientation once and audits every row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "orientation.mentor@example.com");
  await createMentorProfile(current, token);
  const userId = await userIdFor(current, "orientation.mentor@example.com");

  const first = await apiRequest(
    current,
    "POST",
    "/v1/me/consents",
    { purpose: "VOLUNTEER_AGREEMENT", action: "GRANTED", document_version: CONSENT_DOCUMENT_VERSION },
    token,
  );
  assert.equal(first.status, 200, first.text);
  assert.ok(first.body?.orientation_completed_at, "the first grant stamps the orientation");
  const stamp = String(first.body.orientation_completed_at);

  const rows = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM consent_records WHERE user_id = $1 AND purpose = 'VOLUNTEER_AGREEMENT'",
    [userId],
  );
  assert.equal(rows.rows[0].count, "1", "one row for one acceptance");

  const second = await apiRequest(
    current,
    "POST",
    "/v1/me/consents",
    { purpose: "VOLUNTEER_AGREEMENT", action: "GRANTED", document_version: CONSENT_DOCUMENT_VERSION },
    token,
  );
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body?.orientation_completed_at, stamp, "the stamp is never rewritten");

  const audit = await current.client.query<{ action: string; count: string }>(
    "SELECT action, count(*)::text AS count FROM audit_logs WHERE actor_user_id = $1 GROUP BY action ORDER BY action",
    [userId],
  );
  const counts = new Map(audit.rows.map((row) => [row.action, row.count]));
  assert.equal(counts.get("CONSENT_GRANTED"), "2", "one audit row per accepted document");
  assert.equal(counts.get("ORIENTATION_COMPLETED"), "1", "the orientation is stamped once");
});

test("each refusal answers its status and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "refusals@example.com");
  const userId = await userIdFor(current, "refusals@example.com");
  const before = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM consent_records WHERE user_id = $1",
    [userId],
  );
  const strangerInstitution = await createInstitution(current, "Stranger University");

  const cases: [string, unknown, number][] = [
    ["an unknown purpose", { purpose: "MARKETING", action: "GRANTED", document_version: "1" }, 422],
    ["a bad action", { purpose: "TERMS", action: "MAYBE", document_version: "1" }, 422],
    ["a missing version", { purpose: "TERMS", action: "GRANTED", document_version: "" }, 422],
    [
      "a version above the bound",
      { purpose: "TERMS", action: "GRANTED", document_version: "v".repeat(33) },
      422,
    ],
    [
      "an institution on a non-sharing purpose",
      { purpose: "TERMS", action: "GRANTED", document_version: "1", institution_id: strangerInstitution },
      422,
    ],
    ["a sharing grant with no institution", { purpose: "INSTITUTION_DATA_SHARING", action: "GRANTED", document_version: "1" }, 422],
    [
      "a sharing grant for an unaffiliated institution",
      {
        purpose: "INSTITUTION_DATA_SHARING",
        action: "GRANTED",
        document_version: "1",
        institution_id: strangerInstitution,
      },
      404,
    ],
  ];

  for (const [label, body, status] of cases) {
    const refused = await apiRequest(current, "POST", "/v1/me/consents", body, token);
    assert.equal(refused.status, status, `${label}: ${refused.text}`);
  }

  const after = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM consent_records WHERE user_id = $1",
    [userId],
  );
  assert.equal(after.rows[0].count, before.rows[0].count, "no refusal wrote a row");
});

test("a sharing grant names the institution and a withdrawal changes nothing else", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "sharing.student@example.edu.bd");
  const institutionId = await createInstitution(current, "Sharing University");
  await current.client.query(
    "INSERT INTO affiliations (user_id, institution_id, kind, method, status, level) VALUES ($1, $2, 'STUDENT', 'ADMIN_ATTESTATION', 'VERIFIED', 'LEVEL_1')",
    [await userIdFor(current, "sharing.student@example.edu.bd"), institutionId],
  );

  const read = await apiRequest(current, "GET", "/v1/me/consents", undefined, token);
  const institutions = read.body?.institutions as Record<string, unknown>[];
  assert.deepEqual(institutions, [{ id: institutionId, name: "Sharing University" }]);

  const granted = await apiRequest(
    current,
    "POST",
    "/v1/me/consents",
    {
      purpose: "INSTITUTION_DATA_SHARING",
      action: "GRANTED",
      document_version: CONSENT_DOCUMENT_VERSION,
      institution_id: institutionId,
    },
    token,
  );
  assert.equal(granted.status, 200, granted.text);
  assert.equal(granted.body?.institution_id, institutionId);

  const withdrawn = await apiRequest(
    current,
    "POST",
    "/v1/me/consents",
    {
      purpose: "INSTITUTION_DATA_SHARING",
      action: "WITHDRAWN",
      document_version: CONSENT_DOCUMENT_VERSION,
      institution_id: institutionId,
    },
    token,
  );
  assert.equal(withdrawn.status, 200, withdrawn.text);

  const afterRead = await apiRequest(current, "GET", "/v1/me/consents", undefined, token);
  const entry = (afterRead.body?.purposes as Record<string, unknown>[]).find(
    (candidate) => candidate.purpose === "INSTITUTION_DATA_SHARING",
  );
  assert.equal(entry?.action, "WITHDRAWN");
  assert.equal(entry?.accepted_version, null, "a withdrawal clears the accepted version");

  const affiliations = await current.client.query<{ count: string; status: string; level: string }>(
    "SELECT count(*)::text AS count, min(status) AS status, min(level) AS level FROM affiliations WHERE user_id = $1",
    [await userIdFor(current, "sharing.student@example.edu.bd")],
  );
  assert.equal(affiliations.rows[0].count, "1", "the affiliation row is untouched");
  assert.equal(affiliations.rows[0].status, "VERIFIED");
  assert.equal(affiliations.rows[0].level, "LEVEL_1");

  const rows = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM consent_records WHERE user_id = $1 AND purpose = 'INSTITUTION_DATA_SHARING'",
    [await userIdFor(current, "sharing.student@example.edu.bd")],
  );
  assert.equal(rows.rows[0].count, "2", "append-only: a grant and a withdrawal are two rows");
});

test("accepting both documents is what lets a verified, MFA-enrolled mentor become ACTIVE", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await tokenFor(current, "gate.mentor@example.edu.bd");
  await createMentorProfile(current, token);
  const userId = await userIdFor(current, "gate.mentor@example.edu.bd");

  // Level 1 plus an enrolled factor, without the agreements: still PENDING.
  const institutionId = await createInstitution(current, "Gate University");
  await current.client.query(
    "INSERT INTO affiliations (user_id, institution_id, kind, method, status, level) VALUES ($1, $2, 'ALUMNUS', 'ADMIN_ATTESTATION', 'VERIFIED', 'LEVEL_1')",
    [userId, institutionId],
  );
  const enrollment = await apiRequest(current, "POST", "/v1/auth/mfa/enroll", { password: TEST_PASSWORD }, token);
  assert.equal(enrollment.status, 200, enrollment.text);
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [userId]);

  const beforeAgreements = await apiRequest(current, "GET", "/v1/me/consents", undefined, token);
  assert.equal(beforeAgreements.status, 200);
  const profileBefore = await current.client.query<{ status: string }>(
    "SELECT status FROM mentor_profiles WHERE user_id = $1",
    [userId],
  );
  assert.notEqual(profileBefore.rows[0].status, "ACTIVE", "no agreements, no activation");

  for (const purpose of ["VOLUNTEER_AGREEMENT", "COMMUNITY_GUIDELINES"]) {
    const accepted = await apiRequest(
      current,
      "POST",
      "/v1/me/consents",
      { purpose, action: "GRANTED", document_version: CONSENT_DOCUMENT_VERSION },
      token,
    );
    assert.equal(accepted.status, 200, accepted.text);
  }

  const profileAfter = await current.client.query<{ status: string; activated_at: Date | null }>(
    "SELECT status, activated_at FROM mentor_profiles WHERE user_id = $1",
    [userId],
  );
  assert.equal(profileAfter.rows[0].status, "ACTIVE", "both documents plus the orientation activate");
  assert.ok(profileAfter.rows[0].activated_at, "activation sets activated_at");
});
