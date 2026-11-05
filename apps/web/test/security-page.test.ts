import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enrollReducer,
  initialEnrollmentState,
  type EnrollmentState,
} from "../lib/enrollment-state.js";

const pending = enrollReducer(initialEnrollmentState, {
  type: "enrolled",
  secret: "JBSWY3DPEHPK3PXP",
  uri: "otpauth://totp/connect:account?secret=JBSWY3DPEHPK3PXP",
  backupCodes: ["11111111", "22222222"],
});

test("an account without a factor starts idle and an enrolled one starts enrolled", () => {
  assert.deepEqual(enrollReducer(initialEnrollmentState, { type: "loaded", mfaEnabled: false }), {
    phase: "idle",
    error: null,
  });
  assert.deepEqual(enrollReducer(initialEnrollmentState, { type: "loaded", mfaEnabled: true }), {
    phase: "enrolled",
    error: null,
  });
});

test("enrollment returns the secret, the URI, and the codes in pending only", () => {
  assert.equal(pending.phase, "pending");
  assert.ok(pending.phase === "pending");
  assert.equal(pending.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(pending.backupCodes.length, 2);
});

test("a verified code turns a pending enrollment on and drops the secret material", () => {
  const enrolled = enrollReducer(pending, { type: "verified" });

  assert.deepEqual(enrolled, { phase: "enrolled", error: null });
  for (const state of [enrolled, initialEnrollmentState]) {
    assert.ok(!("secret" in state));
    assert.ok(!("backupCodes" in state));
    assert.ok(!("uri" in state));
  }
});

test("a verification that does not belong to a pending enrollment changes nothing", () => {
  assert.equal(enrollReducer(initialEnrollmentState, { type: "verified" }), initialEnrollmentState);
});

test("disable runs enrolled to disabling to idle, and only from enrolled", () => {
  const enrolled: EnrollmentState = { phase: "enrolled", error: null };
  const disabling = enrollReducer(enrolled, { type: "disableRequested" });

  assert.deepEqual(disabling, { phase: "disabling", error: null });
  assert.deepEqual(enrollReducer(disabling, { type: "disabled" }), { phase: "idle", error: null });
  assert.equal(enrollReducer(pending, { type: "disableRequested" }), pending);
});

test("a wrong password leaves an unenrolled account idle with the error shown", () => {
  const failed = enrollReducer(initialEnrollmentState, {
    type: "failed",
    message: "That password is not correct. No change was made.",
  });

  assert.equal(failed.phase, "idle");
  assert.equal(failed.error, "That password is not correct. No change was made.");
  assert.deepEqual(enrollReducer(failed, { type: "dismissed" }), initialEnrollmentState);
});

test("a wrong code keeps the pending enrollment pending and the factor inactive", () => {
  const failed = enrollReducer(pending, { type: "failed", message: "That code is not valid." });

  assert.equal(failed.phase, "pending");
  assert.ok(failed.phase === "pending");
  assert.equal(failed.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(failed.error, "That code is not valid.");
});

test("a failed disable keeps the factor enrolled", () => {
  const failed = enrollReducer({ phase: "enrolled", error: null }, {
    type: "failed",
    message: "That password is not correct. No change was made.",
  });

  assert.equal(failed.phase, "enrolled");
  assert.ok(failed.error);
});
