import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { ROUTE_BODY_KEYS } from "@connect/contracts";

import { AffiliationsController } from "../src/affiliations/affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import { AvailabilityController } from "../src/availability/availability.controller.js";
import { AVAILABILITY_SERVICE } from "../src/availability/availability.tokens.js";
import { DrizzleAvailabilityService } from "../src/availability/drizzle-availability.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { DrizzleMentorshipService } from "../src/mentorships/drizzle-mentorship.service.js";
import { AdminThreadController } from "../src/mentorships/admin-thread.controller.js";
import { MentorshipsController, SessionsController } from "../src/mentorships/mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "../src/mentorships/mentorships.tokens.js";
import { DrizzleOutcomeService } from "../src/outcomes/drizzle-outcome.service.js";
import { OutcomesController } from "../src/outcomes/outcomes.controller.js";
import { OUTCOME_SERVICE } from "../src/outcomes/outcomes.tokens.js";
import { DrizzlePrivacyService } from "../src/privacy/drizzle-privacy.service.js";
import { AttestationController } from "../src/institutions/attestation.controller.js";
import { InstitutionsController } from "../src/institutions/institutions.controller.js";
import { INSTITUTIONS_SERVICE } from "../src/institutions/institutions.tokens.js";
import { DrizzleInstitutionsService } from "../src/institutions/drizzle-institutions.service.js";
import { ATTESTATIONS_SERVICE } from "../src/institutions/attestation.tokens.js";
import { DrizzleAttestationsService } from "../src/institutions/drizzle-attestation.service.js";
import { DrizzleMatchingService } from "../src/matching/drizzle-matching.service.js";
import { MatchingController } from "../src/matching/matching.controller.js";
import { MATCHING_SERVICE } from "../src/matching/matching.tokens.js";
import { ReportsAdminController } from "../src/reports/admin.controller.js";
import { DrizzleReportsService } from "../src/reports/drizzle-reports.service.js";
import { ReportsController } from "../src/reports/reports.controller.js";
import { REPORTS_SERVICE } from "../src/reports/reports.tokens.js";
import { PrivacyController } from "../src/privacy/privacy.controller.js";
import { PRIVACY_SERVICE } from "../src/privacy/privacy.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { DrizzleRequestsService } from "../src/requests/drizzle-requests.service.js";
import { RequestsController } from "../src/requests/requests.controller.js";
import { REQUESTS_SERVICE } from "../src/requests/requests.tokens.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

const CONTROLLERS = [
  AuthController,
  MeController,
  MeRolesController,
  ProfilesController,
  AvailabilityController,
  AffiliationsController,
  RequestsController,
  MentorshipsController,
  AdminThreadController,
  SessionsController,
  OutcomesController,
  PrivacyController,
  ReportsController,
  ReportsAdminController,
  MatchingController,
  AttestationController,
  InstitutionsController,
];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
      {
        provide: PRIVACY_SERVICE,
        useValue: new DrizzlePrivacyService({ database, secret: "x".repeat(32) }),
      },
      { provide: REPORTS_SERVICE, useValue: new DrizzleReportsService(database) },
      { provide: AVAILABILITY_SERVICE, useValue: new DrizzleAvailabilityService(database) },
      { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
      { provide: REQUESTS_SERVICE, useValue: new DrizzleRequestsService(database) },
      { provide: MENTORSHIP_SERVICE, useValue: new DrizzleMentorshipService(database) },
      { provide: OUTCOME_SERVICE, useValue: new DrizzleOutcomeService(database) },
      {
        provide: MATCHING_SERVICE,
        useValue: new DrizzleMatchingService(new DrizzleProfilesService(database)),
      },
      { provide: ATTESTATIONS_SERVICE, useValue: new DrizzleAttestationsService(database) },
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

test("every registered write route has a documented body allowlist", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const mutating = current.routes.filter(
    (route) => !route.startsWith("GET ") && !route.startsWith("DELETE "),
  );
  const missing = mutating.filter((route) => !(route in ROUTE_BODY_KEYS));
  assert.deepEqual(missing, [], `routes without an allowlist: ${missing.join(", ")}`);

  const stale = Object.keys(ROUTE_BODY_KEYS).filter((route) => !current.routes.includes(route));
  assert.deepEqual(stale, [], `allowlists without a route: ${stale.join(", ")}`);
});

test("an unknown body property is refused with 422 and names the key", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const response = await apiRequest(current, "POST", "/v1/auth/register", {
    display_name: "Rahim Uddin",
    email: "unknown-key@example.com",
    password: "a sufficiently long passphrase",
    date_of_birth: "2000-01-01",
    user_id: "someone-else",
  });
  assert.equal(response.status, 422, response.text);
  assert.equal(response.body?.code, "VALIDATION_FAILED");
  assert.match(String(response.body?.detail), /unknown property: user_id/);

  const created = await current.client.query("SELECT id FROM users WHERE email = $1", [
    "unknown-key@example.com",
  ]);
  assert.equal(created.rowCount, 0, "a refused body writes nothing");
});

test("several unknown keys name the first one in sorted order", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const response = await apiRequest(current, "POST", "/v1/auth/sign-in", {
    email: "x@example.com",
    password: "a sufficiently long passphrase",
    zebra: 1,
    alpha: 2,
  });
  assert.equal(response.status, 422, response.text);
  assert.match(String(response.body?.detail), /unknown property: alpha/);
});

test("a non-object body is refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const response = await apiRequest(current, "POST", "/v1/auth/sign-in", "not-an-object");
  assert.equal(response.status, 422, response.text);
  assert.match(String(response.body?.detail), /must be a JSON object/);
});

test("account_status stays an accepted no-op on registration and profile saves", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const registration = await apiRequest(current, "POST", "/v1/auth/register", {
    display_name: "Rahim Uddin",
    email: "account-status@example.com",
    password: "a sufficiently long passphrase",
    date_of_birth: "2000-01-01",
    consent_accepted: true,
    account_status: "ACTIVE",
  });
  assert.equal(registration.status, 200, registration.text);

  // A separate verified account proves the no-op on a profile save too.
  await registerAndVerify(current, "account-status-profile@example.com");
  const signedIn = await signIn(current, "account-status-profile@example.com");
  assert.equal(signedIn.status, 200, signedIn.text);
  const token = String(signedIn.body?.session_token);
  const profile = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    {
      goals: "Find an internship",
      primary_field: "Software engineering",
      account_status: "ACTIVE",
    },
    token,
  );
  assert.equal(profile.status, 200, profile.text);
});

test("an oversized body is refused with 413 before a handler runs", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const response = await apiRequest(current, "POST", "/v1/auth/sign-in", {
    email: "oversized@example.com",
    password: "x".repeat(200_000),
  });
  assert.equal(response.status, 413, response.text.slice(0, 200));
  assert.equal(response.body?.code, "PAYLOAD_TOO_LARGE");
});

test("a library rate-limit code becomes 429 RATE_LIMITED, not a 500", async () => {
  // The identity library's raw 429 carries only `statusCode`; the filter is the
  // single boundary that turns it into the documented problem (DEBT-12).
  const { ProblemDetailsFilter } = await import("../src/http/problem-details.filter.js");
  const captured: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    type() {
      return this;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
      return this;
    },
    getHeader() {
      return undefined;
    },
    /** The filter reads every `retry-after*` header a named bucket may set. */
    getHeaders() {
      return captured.headers;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ requestId: "test", method: "POST", originalUrl: "/v1/auth/sign-in" }),
    }),
  };

  new ProblemDetailsFilter().catch({ statusCode: 429 }, host as never);

  assert.equal(captured.status, 429);
  assert.equal((captured.body as { code?: string }).code, "RATE_LIMITED");
  assert.equal(captured.headers["Retry-After"], "60");
});

test("registerAndVerify still works through the strict guard", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await registerAndVerify(current, "strict-guard@example.com");
});
