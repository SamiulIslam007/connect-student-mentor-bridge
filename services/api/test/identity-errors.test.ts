import assert from "node:assert/strict";
import { test } from "node:test";

import { asValidationFailure, isClientApiError } from "../src/identity/api-error.js";

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
