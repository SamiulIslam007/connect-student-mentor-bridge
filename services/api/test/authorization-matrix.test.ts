import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import type { Role } from "@connect/domain";

import { AvailabilityController } from "../src/availability/availability.controller.js";
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

/**
 * The permission matrix (design D5, task 3.3): every registered route names its
 * requirement, every requirement names a route, and each principal is refused
 * exactly where the table says so.
 */
interface Requirement {
  route: RegExp;
  access: "public" | "signed-in" | Role;
  /** The probe changes state (a grant, a sign-out), so it gets a throwaway account. */
  mutating?: boolean;
  /** Sent instead of `{}` where the handler validates the body before the session. */
  body?: unknown;
  /** The handler itself answers 401 for a bad credential, so 401 is not "signed out". */
  mayReturn401?: boolean;
}

const MATRIX: Requirement[] = [
  { route: /^POST \/v1\/auth\/register$/, access: "public" },
  { route: /^GET \/v1\/auth\/verify$/, access: "public" },
  { route: /^POST \/v1\/auth\/sign-in$/, access: "public" },
  { route: /^POST \/v1\/auth\/sign-in\/provider$/, access: "public" },
  { route: /^POST \/v1\/auth\/provider\/callback$/, access: "public" },
  { route: /^POST \/v1\/auth\/forgot-password$/, access: "public" },
  { route: /^POST \/v1\/auth\/reset-password$/, access: "public" },
  { route: /^POST \/v1\/auth\/mfa\/enroll$/, access: "signed-in", mutating: true },
  // The code is validated before the session is read, so a real body is required
  // for the anonymous probe to reach the 401.
  {
    route: /^POST \/v1\/auth\/mfa\/verify$/,
    access: "signed-in",
    mutating: true,
    body: { code: "000000" },
    mayReturn401: true,
  },
  { route: /^POST \/v1\/auth\/mfa\/disable$/, access: "signed-in", mutating: true },
  { route: /^POST \/v1\/auth\/sign-out$/, access: "signed-in", mutating: true },
  { route: /^POST \/v1\/auth\/sign-out-everywhere$/, access: "signed-in", mutating: true },
  { route: /^GET \/v1\/me$/, access: "signed-in" },
  { route: /^POST \/v1\/me\/deactivate$/, access: "signed-in", mutating: true },
  { route: /^GET \/v1\/me\/sessions$/, access: "signed-in" },
  { route: /^DELETE \/v1\/me\/sessions\/:id$/, access: "signed-in", mutating: true },
  { route: /^POST \/v1\/me\/roles\/mentor$/, access: "signed-in", mutating: true },
  { route: /^PUT \/v1\/me\/student-profile$/, access: "signed-in", mutating: true },
  { route: /^PUT \/v1\/me\/mentor-profile$/, access: "MENTOR", mutating: true },
  { route: /^POST \/v1\/me\/mentor-profile\/pause$/, access: "MENTOR", mutating: true },
  { route: /^POST \/v1\/me\/mentor-profile\/resume$/, access: "MENTOR", mutating: true },
  // The mentor context inside this route is role-gated; the student context is
  // not, so the route's requirement is a session (the per-context refusal is
  // asserted in availability.integration.test.ts).
  { route: /^GET \/v1\/me\/availability$/, access: "signed-in" },
  { route: /^PUT \/v1\/me\/availability$/, access: "signed-in", mutating: true },
  { route: /^GET \/v1\/fields$/, access: "signed-in" },
];

const PRINCIPAL_ROLES: Role[] = ["STUDENT", "MENTOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";
let institutionId: string | undefined;

before(async () => {
  const started = await startApiStack({
    controllers: [
      AuthController,
      MeController,
      MeRolesController,
      ProfilesController,
      AvailabilityController,
    ],
    requestIdRoutes: [
      AuthController,
      MeController,
      MeRolesController,
      ProfilesController,
      AvailabilityController,
    ],
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      { provide: AVAILABILITY_SERVICE, useValue: new DrizzleAvailabilityService(database) },
    ],
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
  const institutions = await stack.client.query<{ id: string }>("SELECT id FROM institutions LIMIT 1");
  if (institutions.rows[0]) {
    institutionId = institutions.rows[0].id;
  } else {
    const created = await stack.client.query<{ id: string }>(
      "INSERT INTO institutions (name, kind, country_code, status) VALUES ('Matrix University', 'UNIVERSITY', 'BD', 'ACTIVE') RETURNING id",
    );
    institutionId = created.rows[0]?.id;
  }
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

async function createPrincipal(current: TestApiStack, role: Role, label: string): Promise<string> {
  const email = `${role.toLowerCase()}-${label}@matrix.example.com`;
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  const token = String(signedIn.body?.session_token);

  if (role === "MENTOR") {
    const granted = await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token);
    assert.equal(granted.status, 200, granted.text);
  } else if (role !== "STUDENT") {
    const user = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    await current.client.query(
      "INSERT INTO role_assignments (user_id, role, institution_id) VALUES ($1, $2, $3)",
      [user.rows[0]?.id, role, role === "INSTITUTION_ADMIN" ? institutionId : null],
    );
  }
  return token;
}

/** `METHOD /path` as the matrix writes it, without the method prefix. */
function probePath(route: string): string {
  return route.split(" ")[1].replace("/:id", "/00000000-0000-0000-0000-000000000000");
}

function probeMethod(route: string): "GET" | "POST" | "PUT" | "DELETE" {
  return route.split(" ")[0] as "GET" | "POST" | "PUT" | "DELETE";
}

test("every registered route is described by the permission matrix", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const undescribed = current.routes.filter(
    (route) => !MATRIX.some((entry) => entry.route.test(route)),
  );
  assert.deepEqual(undescribed, [], `routes missing from the matrix: ${undescribed.join(", ")}`);

  const stale = MATRIX.filter((entry) => !current.routes.some((route) => entry.route.test(route)));
  assert.deepEqual(
    stale.map((entry) => String(entry.route)),
    [],
    "the matrix must not describe routes that no longer exist",
  );
});

test("no session is refused on every non-public route", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  for (const entry of MATRIX) {
    if (entry.access === "public") {
      continue;
    }
    const route: string | undefined = current.routes.find((candidate) => entry.route.test(candidate));
    assert.ok(route, `no registered route matches ${entry.route}`);
    const method = probeMethod(route);
    const response = await apiRequest(
      current,
      method,
      probePath(route),
      method === "GET" || method === "DELETE" ? undefined : entry.body ?? {},
    );
    assert.equal(response.status, 401, `${route} must refuse an anonymous caller`);
  }
});

test("each principal is refused exactly where the matrix says", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const api: TestApiStack = current;

  const shared = new Map<Role, string>();
  async function principalFor(role: Role, mutating: boolean): Promise<string> {
    if (mutating) {
      return createPrincipal(api, role, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
    const existing = shared.get(role);
    if (existing) {
      return existing;
    }
    const created = await createPrincipal(api, role, "shared");
    shared.set(role, created);
    return created;
  }

  for (const entry of MATRIX) {
    if (entry.access === "public") {
      continue;
    }
    const route: string | undefined = current.routes.find((candidate) => entry.route.test(candidate));
    assert.ok(route);
    const method = probeMethod(route);
    const body = method === "GET" || method === "DELETE" ? undefined : entry.body ?? {};

    for (const role of PRINCIPAL_ROLES) {
      const token = await principalFor(role, entry.mutating === true);
      const response = await apiRequest(current, method, probePath(route), body, token);
      const allowed = entry.access === "signed-in" || entry.access === role;

      if (!allowed) {
        assert.equal(response.status, 403, `${role} on ${route} must be refused`);
        assert.equal(response.body?.code, "ROLE_REQUIRED", `${role} on ${route}`);
        continue;
      }
      if (!entry.mayReturn401) {
        assert.notEqual(response.status, 401, `${role} on ${route} must not be treated as signed out`);
      }
      assert.notEqual(response.body?.code, "ROLE_REQUIRED", `${role} on ${route}`);
    }
  }
});
