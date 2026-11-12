import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { InstitutionsController } from "../src/institutions/institutions.controller.js";
import { INSTITUTIONS_SERVICE } from "../src/institutions/institutions.tokens.js";
import { DrizzleInstitutionsService } from "../src/institutions/drizzle-institutions.service.js";
import { MeRolesController } from "../src/me/roles.controller.js";
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
    controllers: [AuthController, MeRolesController, InstitutionsController],
    requestIdRoutes: [AuthController, MeRolesController, InstitutionsController],
    providers: (database) => [
      { provide: INSTITUTIONS_SERVICE, useValue: new DrizzleInstitutionsService(database) },
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
    // truncateAll() does not know institutions (or the outbox); a leaked row
    // would falsify the counts below.
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

/** The flag the API reads is `users.two_factor_enabled`, so both the row and the flag are set. */
async function enrollFactor(current: TestApiStack, userId: string): Promise<void> {
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [userId]);
  await current.client.query(
    "INSERT INTO two_factors (id, secret, backup_codes, user_id, verified) VALUES ($1, 'TEST-TOTP-SECRET', '[]', $2, true)",
    [`factor-${userId}`, userId],
  );
}

async function platformAdmin(
  current: TestApiStack,
  email: string,
  options: { mfa?: boolean } = {},
): Promise<string> {
  const token = await tokenFor(current, email);
  const userId = await userIdFor(current, email);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [userId],
  );
  if (options.mfa !== false) {
    await enrollFactor(current, userId);
  }
  return token;
}

async function memberCount(current: TestApiStack): Promise<{ institutions: number; domains: number }> {
  const institutions = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM institutions",
  );
  const domains = await current.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM institution_domains",
  );
  return {
    institutions: Number(institutions.rows[0]?.count ?? "0"),
    domains: Number(domains.rows[0]?.count ?? "0"),
  };
}

async function auditRows(current: TestApiStack): Promise<{ action: string; actor: string | null; metadata: unknown }[]> {
  const result = await current.client.query<{ action: string; actor_user_id: string | null; metadata: unknown }>(
    "SELECT action, actor_user_id, metadata FROM audit_logs WHERE action IN ('INSTITUTION_CREATED', 'INSTITUTION_DOMAIN_REGISTERED') ORDER BY action, id",
  );
  return result.rows.map((row) => ({ action: row.action, actor: row.actor_user_id, metadata: row.metadata }));
}

const CREATE = "/v1/institutions";

test("a platform admin creates an institution with its domains and reads it back", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-create@institutions.example.com");

  const created = await apiRequest(
    current,
    "POST",
    CREATE,
    {
      name: "  Dhaka University  ",
      kind: "UNIVERSITY",
      country_code: "bd",
      mou_signed_on: "2026-10-01",
      domains: ["DU.ac.bd", "cse.du.ac.bd"],
    },
    token,
  );

  assert.equal(created.status, 201, created.text);
  assert.deepEqual(Object.keys(created.body ?? {}).sort(), [
    "country_code",
    "domains",
    "id",
    "kind",
    "mou_signed_on",
    "name",
    "status",
  ]);
  assert.equal(created.body?.name, "Dhaka University");
  assert.equal(created.body?.kind, "UNIVERSITY");
  assert.equal(created.body?.country_code, "BD");
  assert.equal(created.body?.status, "ONBOARDING");
  assert.equal(created.body?.mou_signed_on, "2026-10-01");
  assert.deepEqual(created.body?.domains, ["du.ac.bd", "cse.du.ac.bd"]);

  const listed = await apiRequest(current, "GET", CREATE, undefined, token);
  assert.equal(listed.status, 200, listed.text);
  const data = (listed.body?.data ?? []) as Record<string, unknown>[];
  assert.equal(data.length, 1);
  assert.equal(data[0]?.id, created.body?.id);
  // The read orders a domain list by domain, so compare as sets.
  assert.deepEqual(
    [...((data[0]?.domains ?? []) as string[])].sort(),
    ["cse.du.ac.bd", "du.ac.bd"],
  );
});

test("the optional fields can be omitted", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-minimal@institutions.example.com");

  const created = await apiRequest(
    current,
    "POST",
    CREATE,
    { name: "Minimal Institute", kind: "OTHER", country_code: "BD" },
    token,
  );

  assert.equal(created.status, 201, created.text);
  assert.equal(created.body?.mou_signed_on, null);
  assert.deepEqual(created.body?.domains, []);
});

test("a duplicate domain is refused in any letter case and creates nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-duplicate@institutions.example.com");

  const first = await apiRequest(
    current,
    "POST",
    CREATE,
    { name: "First University", kind: "UNIVERSITY", country_code: "BD", domains: ["first.edu.bd"] },
    token,
  );
  assert.equal(first.status, 201, first.text);

  for (const domain of ["first.edu.bd", "FIRST.EDU.BD", "First.Edu.Bd"]) {
    const second = await apiRequest(
      current,
      "POST",
      CREATE,
      { name: `Second ${domain}`, kind: "UNIVERSITY", country_code: "BD", domains: [domain] },
      token,
    );
    assert.equal(second.status, 409, `${domain}: ${second.text}`);
    assert.equal(second.body?.code, "INSTITUTION_DOMAIN_TAKEN", domain);
  }

  const counts = await memberCount(current);
  assert.equal(counts.institutions, 1);
  assert.equal(counts.domains, 1);
});

test("one duplicate domain rolls the whole creation back", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-partial@institutions.example.com");

  const first = await apiRequest(
    current,
    "POST",
    CREATE,
    { name: "Holder University", kind: "UNIVERSITY", country_code: "BD", domains: ["holder.edu.bd"] },
    token,
  );
  assert.equal(first.status, 201, first.text);
  const auditsBefore = await auditRows(current);

  const second = await apiRequest(
    current,
    "POST",
    CREATE,
    {
      name: "Rollback University",
      kind: "UNIVERSITY",
      country_code: "BD",
      domains: ["fresh.edu.bd", "holder.edu.bd"],
    },
    token,
  );

  assert.equal(second.status, 409, second.text);
  assert.equal(second.body?.code, "INSTITUTION_DOMAIN_TAKEN");
  const counts = await memberCount(current);
  assert.equal(counts.institutions, 1);
  assert.equal(counts.domains, 1);
  const names = await current.client.query("SELECT name FROM institutions");
  assert.deepEqual(
    names.rows.map((row) => (row as { name: string }).name),
    ["Holder University"],
  );
  assert.deepEqual(await auditRows(current), auditsBefore);
});

test("creation writes one audit row and one row per domain, naming the actor", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-audit@institutions.example.com");
  const actorId = await userIdFor(current, "admin-audit@institutions.example.com");

  const created = await apiRequest(
    current,
    "POST",
    CREATE,
    { name: "Audited University", kind: "BOOTCAMP", country_code: "BD", domains: ["a.edu.bd", "b.edu.bd"] },
    token,
  );
  assert.equal(created.status, 201, created.text);

  const rows = await auditRows(current);
  assert.equal(rows.filter((row) => row.action === "INSTITUTION_CREATED").length, 1);
  assert.equal(rows.filter((row) => row.action === "INSTITUTION_DOMAIN_REGISTERED").length, 2);
  for (const row of rows) {
    assert.equal(row.actor, actorId, "every row names the acting account");
    assert.equal(
      JSON.stringify(row.metadata).includes("@"),
      false,
      "metadata never carries an email address",
    );
  }
});

test("a refused creation leaves no audit row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-refused@institutions.example.com");

  const refused = await apiRequest(
    current,
    "POST",
    CREATE,
    { name: "", kind: "UNIVERSITY", country_code: "BD" },
    token,
  );

  assert.equal(refused.status, 422, refused.text);
  assert.deepEqual(await auditRows(current), []);
});

test("every bound is a 422 naming the field and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-bounds@institutions.example.com");

  const cases: { body: Record<string, unknown>; field: string }[] = [
    { body: { name: "", kind: "UNIVERSITY", country_code: "BD" }, field: "name" },
    { body: { name: "X", kind: "COLLEGE", country_code: "BD" }, field: "kind" },
    { body: { name: "X", kind: "UNIVERSITY", country_code: "B" }, field: "country_code" },
    { body: { name: "X", kind: "UNIVERSITY", country_code: "BD", mou_signed_on: "2999-01-01" }, field: "mou_signed_on" },
    { body: { name: "X", kind: "UNIVERSITY", country_code: "BD", domains: ["bad@domain"] }, field: "domains" },
    { body: { name: "X", kind: "UNIVERSITY", country_code: "BD", domain: "x.edu" }, field: "domain" },
  ];

  for (const probe of cases) {
    const refused = await apiRequest(current, "POST", CREATE, probe.body, token);
    assert.equal(refused.status, 422, `${probe.field}: ${refused.text}`);
    assert.equal(refused.body?.code, "VALIDATION_FAILED", probe.field);
    assert.match(String(refused.body?.detail ?? ""), new RegExp(probe.field), probe.field);
  }

  const counts = await memberCount(current);
  assert.equal(counts.institutions, 0);
  assert.equal(counts.domains, 0);
});

test("the role and the second factor are both required", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const anonymous = await apiRequest(current, "GET", CREATE);
  assert.equal(anonymous.status, 401);

  const mentorToken = await tokenFor(current, "mentor-onboarding@institutions.example.com");
  await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, mentorToken);
  const asMentor = await apiRequest(current, "POST", CREATE, { name: "X", kind: "UNIVERSITY", country_code: "BD" }, mentorToken);
  assert.equal(asMentor.status, 403);
  assert.equal(asMentor.body?.code, "ROLE_REQUIRED");
  const mentorRead = await apiRequest(current, "GET", CREATE, undefined, mentorToken);
  assert.equal(mentorRead.status, 403);

  const noFactor = await platformAdmin(current, "admin-nofactor@institutions.example.com", { mfa: false });
  const refused = await apiRequest(current, "POST", CREATE, { name: "X", kind: "UNIVERSITY", country_code: "BD" }, noFactor);
  assert.equal(refused.status, 403);
  assert.equal(refused.body?.code, "MFA_REQUIRED");
  const readRefused = await apiRequest(current, "GET", CREATE, undefined, noFactor);
  assert.equal(readRefused.status, 403);
  assert.equal(readRefused.body?.code, "MFA_REQUIRED");

  const counts = await memberCount(current);
  assert.equal(counts.institutions, 0);
});

test("the list carries each institution's own domains in a stable order", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const token = await platformAdmin(current, "admin-list@institutions.example.com");

  for (const [name, domains] of [
    ["Zeta University", ["zeta.edu.bd"]],
    ["Alpha University", ["alpha.edu.bd", "eng.alpha.edu.bd"]],
  ] as const) {
    const created = await apiRequest(
      current,
      "POST",
      CREATE,
      { name, kind: "UNIVERSITY", country_code: "BD", domains: [...domains] },
      token,
    );
    assert.equal(created.status, 201, created.text);
  }

  const first = await apiRequest(current, "GET", CREATE, undefined, token);
  const second = await apiRequest(current, "GET", CREATE, undefined, token);
  assert.equal(first.status, 200, first.text);

  const names = ((first.body?.data ?? []) as { name: string }[]).map((row) => row.name);
  assert.deepEqual(names, ["Alpha University", "Zeta University"]);
  assert.deepEqual(first.body?.data, second.body?.data);

  const rows = (first.body?.data ?? []) as { name: string; domains: string[] }[];
  assert.deepEqual(rows[0]?.domains, ["alpha.edu.bd", "eng.alpha.edu.bd"]);
  assert.deepEqual(rows[1]?.domains, ["zeta.edu.bd"]);
});
