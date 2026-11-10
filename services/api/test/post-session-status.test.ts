import assert from "node:assert/strict";
import { test } from "node:test";

import type { AccountStatus } from "@connect/domain";

import { postSessionRefusal } from "../src/identity/better-auth-identity.service.js";

/**
 * DEBT-09 (D-89): the library owns the session insert, so the sign-in path
 * re-checks the status afterwards. Every non-ACTIVE status must refuse the
 * session it just issued; the interleaving itself is not staged here.
 */
test("every non-active status refuses the session the library just issued", () => {
  const expected: Record<AccountStatus, string | null> = {
    ACTIVE: null,
    PENDING: "EMAIL_NOT_VERIFIED",
    SUSPENDED: "ACCOUNT_SUSPENDED",
    DEACTIVATED: "FORBIDDEN",
    DELETION_PENDING: "FORBIDDEN",
    ANONYMIZED: "FORBIDDEN",
  };

  for (const [status, code] of Object.entries(expected) as [AccountStatus, string | null][]) {
    assert.equal(postSessionRefusal(status), code, status);
  }
});
