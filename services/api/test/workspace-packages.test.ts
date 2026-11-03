import assert from "node:assert/strict";
import { test } from "node:test";

import { type HealthResponse, type ReadinessResponse } from "@connect/contracts";
import { API_SERVICE_NAME, APP_NAME, READINESS_TIMEOUT_MS } from "@connect/config";
import { DOMAIN_PACKAGE_NAME, normalizeFieldName } from "@connect/domain";

/**
 * Smoke test: every workspace package resolves from the API with a real export,
 * so a broken `exports` map or a missing build entry fails here instead of at
 * runtime. The constants themselves are exercised where they are used.
 */
test("the workspace packages resolve and export their public API", () => {
  assert.equal(APP_NAME, "connect");
  assert.equal(API_SERVICE_NAME, "api");
  assert.equal(typeof READINESS_TIMEOUT_MS, "number");
  assert.ok(READINESS_TIMEOUT_MS > 0);

  assert.equal(DOMAIN_PACKAGE_NAME, "@connect/domain");
  assert.equal(normalizeFieldName("Data Science"), "data science");

  // Type-only exports still resolve through the package entry point.
  const health: HealthResponse = { status: "ok", service: "api" };
  const readiness: ReadinessResponse = { status: "ok", checks: { database: "ok" } };
  assert.deepEqual(health, { status: "ok", service: "api" });
  assert.deepEqual(readiness, { status: "ok", checks: { database: "ok" } });
});
