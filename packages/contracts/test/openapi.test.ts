import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse } from "yaml";

const contractPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

interface Operation {
  security?: unknown[];
  responses: Record<string, unknown>;
}

interface Contract {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<
      string,
      {
        allOf?: unknown;
        properties?: Record<string, Record<string, unknown>>;
      }
    >;
  };
}

function contract(): Contract {
  return parse(readFileSync(contractPath, "utf8")) as Contract;
}

test("the OpenAPI source parses and keeps the operational endpoints unauthenticated", () => {
  const document = contract();

  assert.equal(document.openapi, "3.1.0");
  for (const path of ["/healthz", "/readyz"]) {
    assert.deepEqual(document.paths[path].get.security, [], `${path} must not require auth`);
  }
});

test("every auth route implemented by the API controller appears in the contract", () => {
  const document = contract();
  const controller = readFileSync(
    resolve(process.cwd(), "../../services/api/src/identity/auth.controller.ts"),
    "utf8",
  );

  const routes = [...controller.matchAll(/@(Get|Post)\("([^"]+)"\)/g)].map(
    (match) => `/v1/auth/${match[2]}`,
  );
  assert.ok(routes.length >= 7, "the controller must expose the documented auth routes");

  for (const route of routes) {
    assert.ok(document.paths[route], `${route} is implemented but missing from openapi.yaml`);
  }

  const documented = Object.keys(document.paths).filter((path) => path.startsWith("/v1/auth/"));
  assert.deepEqual([...documented].sort(), [...new Set(routes)].sort());
});

test("sign-out routes require the bearer session and public auth routes do not", () => {
  const document = contract();

  for (const path of ["/v1/auth/register", "/v1/auth/verify", "/v1/auth/sign-in", "/v1/auth/forgot-password", "/v1/auth/reset-password"]) {
    const operation = document.paths[path].get ?? document.paths[path].post;
    assert.deepEqual(operation.security, [], `${path} must be reachable without a session`);
  }

  for (const path of ["/v1/auth/sign-out", "/v1/auth/sign-out-everywhere"]) {
    assert.deepEqual(document.paths[path].post.security, [{ bearerAuth: [] }], `${path} must require a session`);
  }
});

test("every auth failure is documented as a problem detail", () => {
  const document = contract();

  for (const path of Object.keys(document.paths).filter((entry) => entry.startsWith("/v1/auth/"))) {
    const operations = Object.values(document.paths[path]);
    for (const operation of operations) {
      const problems = Object.entries(operation.responses).filter(([status]) => status !== "200");
      assert.ok(problems.length > 0, `${path} must document at least one failure`);
      for (const [, response] of problems) {
        assert.deepEqual(response, { $ref: "#/components/responses/Problem" });
      }
    }
  }
});

test("every self-service account route implemented by the controller appears in the contract", () => {
  const document = contract();
  const controller = readFileSync(resolve(process.cwd(), "../../services/api/src/me/me.controller.ts"), "utf8");

  const routes = [...controller.matchAll(/@(Get|Post)\(([^)]*)\)/g)].map((match) => {
    const suffix = match[2].replaceAll('"', "").trim();
    return `/v1/me${suffix ? `/${suffix}` : ""}`;
  });
  assert.deepEqual([...routes].sort(), ["/v1/me", "/v1/me/deactivate", "/v1/me/sessions"]);

  for (const route of routes) {
    assert.ok(document.paths[route], `${route} is implemented but missing from openapi.yaml`);
    const operation = Object.values(document.paths[route])[0];
    assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${route} must require a session`);
  }
});

test("the mentor opt-in route is implemented by its controller and documented", () => {
  const document = contract();
  const controller = readFileSync(
    resolve(process.cwd(), "../../services/api/src/me/roles.controller.ts"),
    "utf8",
  );

  const routes = [...controller.matchAll(/@(Get|Post)\(([^)]*)\)/g)].map((match) => {
    const suffix = match[2].replaceAll('"', "").trim();
    return `/v1/me/roles${suffix ? `/${suffix}` : ""}`;
  });
  assert.deepEqual(routes.sort(), ["/v1/me/roles/mentor"]);

  const operation = document.paths["/v1/me/roles/mentor"].post;
  assert.deepEqual(operation.security, [{ bearerAuth: [] }], "the opt-in requires a session");
  const success = (
    operation.responses["200"] as { content: Record<string, { schema: unknown }> }
  ).content["application/json"].schema;
  assert.deepEqual(success, { $ref: "#/components/schemas/RolesResponse" });
  assert.ok(operation.responses["401"], "the unauthenticated response is documented");
});

test("the profile and field endpoints require a session and are documented", () => {
  const document = contract();

  const studentProfile = document.paths["/v1/me/student-profile"].put;
  const mentorProfile = document.paths["/v1/me/mentor-profile"].put;
  const fields = document.paths["/v1/fields"].get;

  for (const [route, operation] of [
    ["/v1/me/student-profile", studentProfile],
    ["/v1/me/mentor-profile", mentorProfile],
    ["/v1/fields", fields],
  ] as const) {
    assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${route} must require a session`);
    assert.ok(operation.responses["401"], `${route} must document the unauthenticated response`);
  }
  assert.deepEqual(studentProfile.responses["422"], {
    $ref: "#/components/responses/Problem",
  });
  assert.deepEqual(mentorProfile.responses["422"], {
    $ref: "#/components/responses/Problem",
  });

  const me = document.paths["/v1/me"].get;
  const meContent = (me.responses["200"] as {
    content: Record<string, { schema: unknown }>;
  }).content;
  assert.deepEqual(meContent["application/json"].schema, {
    $ref: "#/components/schemas/MeResponse",
  });
  for (const schema of ["MeResponse", "StudentProfile", "MentorProfile", "FieldSummary"]) {
    assert.ok(document.components.schemas[schema], `${schema} must be documented`);
  }
});

test("the field list is keyset-paginated by slug", () => {
  const document = contract();
  const fields = document.paths["/v1/fields"].get as Operation & {
    parameters?: { name: string; in: string }[];
  };

  assert.deepEqual(
    (fields.parameters ?? []).map((parameter) => parameter.name).sort(),
    ["cursor", "limit"],
  );

  const schema = (
    fields.responses["200"] as { content: Record<string, { schema: { required?: string[] } }> }
  ).content["application/json"].schema;
  assert.deepEqual([...(schema.required ?? [])].sort(), ["fields", "next_cursor"]);
  assert.ok(fields.responses["422"], "an invalid page size is documented");
});

test("MeResponse is standalone and both profile properties are nullable", () => {
  const document = contract();
  const me = document.components.schemas.MeResponse;

  assert.equal(me.allOf, undefined, "AccountSummary declares additionalProperties false; allOf cannot extend it");
  assert.deepEqual(Object.keys(me.properties ?? {}).sort(), [
    "account_status",
    "affiliations",
    "display_name",
    "email",
    "email_verified",
    "id",
    "mentor_profile",
    "mfa_enabled",
    "roles",
    "student_profile",
    "timezone",
  ]);

  for (const property of ["student_profile", "mentor_profile"]) {
    const anyOf = me.properties?.[property].anyOf as { type?: string }[] | undefined;
    assert.ok(anyOf, `${property} must be an anyOf so it can be null`);
    assert.ok(
      anyOf.some((entry) => entry.type === "null"),
      `${property} must be nullable`,
    );
  }

  // The sign-in response must not gain profile properties.
  assert.deepEqual(Object.keys(document.components.schemas.AccountSummary.properties ?? {}).sort(), [
    "account_status",
    "display_name",
    "email",
    "email_verified",
    "id",
    "timezone",
  ]);
});

test("profile request bodies document account_status as an accepted no-op", () => {
  const document = contract();

  for (const schema of ["StudentProfileRequest", "MentorProfileRequest"]) {
    const definition = document.components.schemas[schema];
    const property = definition.properties?.account_status;
    assert.ok(property, `${schema} must document account_status`);
    assert.match(String(property.description), /ignored/i);
  }
});

test("availability and access-mode routes are documented and session-guarded", () => {
  const document = contract();

  for (const [path, method] of [
    ["/v1/me/availability", "get"],
    ["/v1/me/availability", "put"],
    ["/v1/me/mentor-profile/pause", "post"],
    ["/v1/me/mentor-profile/resume", "post"],
  ] as const) {
    const operation = document.paths[path][method];
    assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${method} ${path} needs a session`);
    assert.ok(operation.responses["401"], `${method} ${path} documents 401`);
  }

  const availabilityGet = document.paths["/v1/me/availability"].get;
  const parameters = (availabilityGet as { parameters?: { name: string; required?: boolean }[] })
    .parameters;
  assert.deepEqual(
    (parameters ?? []).map((parameter) => [parameter.name, parameter.required]),
    [["context", true]],
  );

  const availabilityRequest = document.components.schemas.AvailabilityRequest as unknown as {
    properties: { windows: { maxItems: number } };
  };
  assert.equal(
    availabilityRequest.properties.windows.maxItems,
    21,
    "the per-context cap is documented",
  );

  const mentorProfile = document.components.schemas.MentorProfile as unknown as {
    properties: Record<string, { $ref?: string }>;
  };
  assert.equal(
    mentorProfile.properties.access_mode.$ref,
    "#/components/schemas/MentorAccessMode",
  );

  const mentorRequest = document.components.schemas.MentorProfileRequest as unknown as {
    required: string[];
  };
  assert.ok(
    !mentorRequest.required.includes("access_mode"),
    "access_mode stays optional on the full replace, so an old client cannot unpause a mentor",
  );
  assert.deepEqual(
    (document.components.schemas.MentorAccessMode as unknown as { enum: string[] }).enum,
    ["OPEN", "APPLICATION_ONLY", "PAUSED"],
  );
});

test("the mentorship surface is documented, session-guarded, and matches the controllers", () => {
  const document = contract();
  const paths = [
    "/v1/mentorships",
    "/v1/mentorships/{id}",
    "/v1/mentorships/{id}/agreement",
    "/v1/mentorships/{id}/agreement/acknowledge",
    "/v1/mentorships/{id}/messages",
    "/v1/mentorships/{id}/sessions",
    "/v1/mentorships/{id}/complete",
    "/v1/sessions/{id}/confirm-held",
    "/v1/sessions/{id}/cancel",
  ];

  const documented = Object.keys(document.paths)
    .filter((path) => path.startsWith("/v1/mentorships") || path.startsWith("/v1/sessions"))
    .sort();
  assert.deepEqual(documented, [...paths].sort());

  for (const path of paths) {
    for (const operation of Object.values(document.paths[path])) {
      assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${path} must require a session`);
      assert.ok(operation.responses["401"], `${path} documents the unauthenticated response`);
      assert.ok(
        operation.responses["404"] || operation.responses["409"] || operation.responses["422"],
        `${path} documents a refusal`,
      );
    }
  }

  // One operation per controller decorator: a new route cannot ship undocumented.
  const controller = readFileSync(
    resolve(process.cwd(), "../../services/api/src/mentorships/mentorships.controller.ts"),
    "utf8",
  );
  const decorators = [...controller.matchAll(/@(Get|Post|Put)\(/g)].length;
  const operations = paths.reduce(
    (total, path) => total + Object.keys(document.paths[path]).length,
    0,
  );
  assert.equal(operations, decorators, "the contract must describe every controller route");
});

test("the thread body bound and the https-only link are in the contract", () => {
  const document = contract();
  const create = document.components.schemas.ThreadMessageCreate as unknown as {
    properties: { body: { maxLength: number } };
  };
  assert.equal(create.properties.body.maxLength, 2_000);

  const session = document.components.schemas.SessionCreate as unknown as {
    properties: { meeting_url: { pattern: string }; duration_minutes: { minimum: number; maximum: number } };
  };
  assert.equal(session.properties.meeting_url.pattern, "^https://");
  assert.deepEqual(
    [session.properties.duration_minutes.minimum, session.properties.duration_minutes.maximum],
    [15, 240],
  );

  const mentorship = document.components.schemas.Mentorship.properties ?? {};
  for (const forbidden of ["score", "points", "tier", "ranking"]) {
    assert.equal(forbidden in mentorship, false, `Mentorship must not carry ${forbidden}`);
  }
});

test("the outcome surface is documented, session-guarded, and matches the controller", () => {
  const document = contract();
  const paths = [
    "/v1/outcomes",
    "/v1/outcomes/{id}",
    "/v1/outcomes/{id}/confirm",
    "/v1/outcomes/{id}/dispute",
    "/v1/outcomes/{id}/withdraw",
  ];

  const documented = Object.keys(document.paths)
    .filter((path) => path.startsWith("/v1/outcomes"))
    .sort();
  assert.deepEqual(documented, [...paths].sort());

  for (const path of paths) {
    for (const operation of Object.values(document.paths[path])) {
      assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${path} must require a session`);
      assert.ok(operation.responses["401"], `${path} documents the unauthenticated response`);
    }
  }

  const controller = readFileSync(
    resolve(process.cwd(), "../../services/api/src/outcomes/outcomes.controller.ts"),
    "utf8",
  );
  const decorators = [...controller.matchAll(/@(Get|Post)\(/g)].length;
  const operations = paths.reduce(
    (total, path) => total + Object.keys(document.paths[path]).length,
    0,
  );
  assert.equal(operations, decorators, "the contract must describe every outcomes route");

  // The evidence endpoints are deliberately absent until the evidence change.
  const evidence = Object.keys(document.paths).filter((path) => path.includes("evidence"));
  assert.deepEqual(evidence, [], "the contract never advertises an unbuilt evidence endpoint");
});

test("the outcome contract carries no score and no counting route", () => {
  const document = contract();
  const outcome = document.components.schemas.Outcome.properties ?? {};
  for (const forbidden of ["score", "points", "tier", "ranking"]) {
    assert.equal(forbidden in outcome, false, `Outcome must not carry ${forbidden}`);
  }

  const create = document.components.schemas.OutcomeCreate as unknown as {
    properties: { description: { maxLength: number }; outcome_type: { enum: string[] } };
  };
  assert.equal(create.properties.description.maxLength, 2_000);
  assert.deepEqual(create.properties.outcome_type.enum, [
    "ADMISSION",
    "INTERNSHIP",
    "JOB_OFFER",
    "SKILL_MILESTONE",
    "INTERVIEW",
  ]);

  const status = document.components.schemas.OutcomeStatus as unknown as { enum: string[] };
  assert.deepEqual(status.enum, [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "IN_PLATFORM_REVIEW",
    "COUNTED",
    "REJECTED",
    "WITHDRAWN",
    "REVERSED",
  ]);
});
