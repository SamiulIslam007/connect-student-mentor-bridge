import assert from "node:assert/strict";
import { test } from "node:test";

import { NETWORK_ERROR_STATUS, signUpErrorMessage } from "../lib/sign-up-errors.js";
import { strings } from "../lib/strings.js";

test("the under-18 refusal has its own message", () => {
  assert.equal(signUpErrorMessage(422, "UNDER_MINIMUM_AGE"), strings.signUp.underAge);
  assert.notEqual(strings.signUp.underAge, strings.signUp.invalid);
  assert.notEqual(strings.signUp.underAge, strings.signUp.error);
});

test("a validation failure stays distinct from the age gate", () => {
  assert.equal(signUpErrorMessage(422, "VALIDATION_FAILED"), strings.signUp.invalid);
  assert.notEqual(strings.signUp.invalid, strings.signUp.underAge);
});

test("network and unknown failures fall back without claiming an age problem", () => {
  assert.equal(signUpErrorMessage(NETWORK_ERROR_STATUS, undefined), strings.signUp.network);
  assert.equal(signUpErrorMessage(500, "INTERNAL_ERROR"), strings.signUp.error);
  assert.equal(signUpErrorMessage(403, "FORBIDDEN"), strings.signUp.error);
});
