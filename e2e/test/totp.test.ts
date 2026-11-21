import assert from "node:assert/strict";
import { test } from "node:test";

import { DEMO_TOTP_SECRET } from "../../services/api/src/db/seed/demo-constants.ts";
import { RFC_6238_SECRET, totp } from "../support/totp";

test("the RFC 6238 SHA-1 vectors, truncated to six digits", () => {
  assert.equal(totp(RFC_6238_SECRET, 59_000), "287082");
  assert.equal(totp(RFC_6238_SECRET, 1_111_111_109_000), "081804");
  assert.equal(totp(RFC_6238_SECRET, 1_234_567_890_000), "005924");
});

test("the seeded demo secret produces a stable six-digit code per window", () => {
  // A window start, so the boundaries below are exact.
  const at = 1_699_999_980_000;
  const code = totp(DEMO_TOTP_SECRET, at);
  assert.match(code, /^\d{6}$/);
  assert.equal(code, totp(DEMO_TOTP_SECRET, at + 29_000));
  assert.notEqual(code, totp(DEMO_TOTP_SECRET, at + 30_000));
});
