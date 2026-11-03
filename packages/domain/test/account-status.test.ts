import assert from "node:assert/strict";
import { test } from "node:test";

import { decideSignIn, type AccountStatus } from "../src/index.js";

test("an active account is allowed and a deactivated account is reactivated first", () => {
  assert.deepEqual(decideSignIn("ACTIVE"), { action: "ALLOW" });
  assert.deepEqual(decideSignIn("DEACTIVATED"), { action: "ACTIVATE_THEN_ALLOW" });
});

test("a pending account is refused as unverified", () => {
  assert.deepEqual(decideSignIn("PENDING"), { action: "REFUSE", code: "EMAIL_NOT_VERIFIED" });
});

test("a suspended account is refused as suspended", () => {
  assert.deepEqual(decideSignIn("SUSPENDED"), { action: "REFUSE", code: "ACCOUNT_SUSPENDED" });
});

test("deletion-pending and anonymized accounts are refused without a status code leak", () => {
  for (const status of ["DELETION_PENDING", "ANONYMIZED"] as const) {
    assert.deepEqual(decideSignIn(status), { action: "REFUSE", code: "FORBIDDEN" });
  }
});

test("every status is decided and only DEACTIVATED can reach the activate branch", () => {
  const statuses: AccountStatus[] = [
    "PENDING",
    "ACTIVE",
    "SUSPENDED",
    "DEACTIVATED",
    "DELETION_PENDING",
    "ANONYMIZED",
  ];
  const activating = statuses.filter((status) => decideSignIn(status).action === "ACTIVATE_THEN_ALLOW");
  assert.deepEqual(activating, ["DEACTIVATED"]);
  for (const status of statuses) {
    assert.ok(["ALLOW", "ACTIVATE_THEN_ALLOW", "REFUSE"].includes(decideSignIn(status).action));
  }
});
