import assert from "node:assert/strict";
import { test } from "node:test";

import { asValidationFailure, isClientApiError } from "../src/identity/api-error.js";
import { readIdentityConfig } from "../src/identity/identity.config.js";

function libraryError(statusCode: number, code?: string): Error {
  return Object.assign(new Error("library failure"), {
    statusCode,
    body: code ? { code } : undefined,
  });
}

test("a library 4xx becomes a validation failure", () => {
  const mapped = asValidationFailure(libraryError(400, "VALIDATION_ERROR"));
  assert.equal(mapped?.code, "VALIDATION_ERROR");
  assert.match(mapped?.message ?? "", /valid email/);
});

test("a 5xx and an unknown error stay server errors", () => {
  assert.equal(isClientApiError(libraryError(500)), false);
  assert.equal(asValidationFailure(libraryError(500)), null);
  assert.equal(asValidationFailure(libraryError(503)), null);
  assert.equal(asValidationFailure(new Error("database connection lost")), null);
});

test("the auth secret boot error names the variable and the generation command", () => {
  assert.throws(
    () => readIdentityConfig({}),
    /BETTER_AUTH_SECRET must be set to at least 32 characters \(generate one with: openssl rand -base64 32\)/,
  );
});
