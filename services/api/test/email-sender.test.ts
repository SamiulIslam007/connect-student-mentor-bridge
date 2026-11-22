import assert from "node:assert/strict";
import { test } from "node:test";

import { smtpTlsPolicy } from "../src/email/smtp-email-sender.js";

/**
 * SEC-AUDIT-014 (D-261): production mail must use TLS; local Mailpit is the one
 * documented plaintext case.
 */

test("production on 465 uses implicit TLS and requires it", () => {
  assert.deepEqual(smtpTlsPolicy({ NODE_ENV: "production", SMTP_PORT: "465" }), {
    secure: true,
    requireTLS: true,
  });
});

test("production on 587 or 25 requires STARTTLS", () => {
  for (const port of ["587", "25", "1025"]) {
    assert.deepEqual(smtpTlsPolicy({ NODE_ENV: "production", SMTP_PORT: port }), {
      secure: false,
      requireTLS: true,
    });
  }
});

test("local development stays plaintext for Mailpit", () => {
  assert.deepEqual(smtpTlsPolicy({ NODE_ENV: "development", SMTP_PORT: "1025" }), {
    secure: false,
    requireTLS: false,
  });
  // An unset NODE_ENV is development, not production.
  assert.deepEqual(smtpTlsPolicy({ SMTP_PORT: "1025" }), {
    secure: false,
    requireTLS: false,
  });
});
