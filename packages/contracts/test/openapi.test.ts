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
  assert.deepEqual([...routes].sort(), ["/v1/me", "/v1/me/deactivate"]);

  for (const route of routes) {
    assert.ok(document.paths[route], `${route} is implemented but missing from openapi.yaml`);
    const operation = Object.values(document.paths[route])[0];
    assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${route} must require a session`);
  }
});
