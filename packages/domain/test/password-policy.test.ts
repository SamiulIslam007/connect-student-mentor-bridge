import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameViolation,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordPolicyViolation,
} from "../src/index.js";

test("11 characters are rejected and 12 are accepted", () => {
  assert.deepEqual(passwordPolicyViolation("a".repeat(MIN_PASSWORD_LENGTH - 1)), {
    code: "TOO_SHORT",
    minimumLength: MIN_PASSWORD_LENGTH,
  });
  assert.equal(passwordPolicyViolation("a".repeat(MIN_PASSWORD_LENGTH)), null);
});

test("a long passphrase is accepted without composition rules", () => {
  const passphrase = "correct horse battery staple and then some more words for length";
  assert.ok(passphrase.length >= 64);
  assert.equal(passwordPolicyViolation(passphrase), null);
  assert.equal(passwordPolicyViolation("all lower case and long enough"), null);
});

test("a password beyond the library maximum is rejected", () => {
  assert.deepEqual(passwordPolicyViolation("a".repeat(MAX_PASSWORD_LENGTH + 1)), {
    code: "TOO_LONG",
    maximumLength: MAX_PASSWORD_LENGTH,
  });
});

test("display names keep Unicode and enforce 1 to 100 characters", () => {
  const banglaName = "রহিম উদ্দিন";
  assert.equal(displayNameViolation(banglaName), null);
  assert.equal(displayNameViolation(""), "EMPTY");
  assert.equal(displayNameViolation("   "), "EMPTY");
  assert.equal(displayNameViolation("a".repeat(DISPLAY_NAME_MAX_LENGTH)), null);
  assert.equal(displayNameViolation("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1)), "TOO_LONG");
});
