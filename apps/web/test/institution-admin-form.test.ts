import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { adminAssignmentError, adminAssignmentPayload } from "../lib/institutions.js";
import { strings } from "../lib/strings.js";

const page = readFileSync(
  fileURLToPath(new URL("../app/admin/institutions/page.tsx", import.meta.url)),
  "utf8",
);
const route = readFileSync(
  fileURLToPath(new URL("../app/api/institutions/[id]/admins/route.ts", import.meta.url)),
  "utf8",
);

test("the grant body is the trimmed lowercase email, and a malformed one is not sent", () => {
  assert.deepEqual(adminAssignmentPayload("  Admin@Example.EDU.bd "), {
    body: { email: "admin@example.edu.bd" },
    valid: true,
  });
  assert.equal(adminAssignmentPayload("").valid, false);
  assert.equal(adminAssignmentPayload("   ").valid, false);
  assert.equal(adminAssignmentPayload("not-an-email").valid, false);
});

test("the existing-account refusal gets its own line; everything else stays generic", () => {
  assert.equal(
    adminAssignmentError(422, "email must belong to an existing account"),
    strings.adminInstitutions.adminNoAccount,
  );
  assert.equal(adminAssignmentError(422, "some other detail"), strings.adminInstitutions.adminFailure);
  assert.equal(adminAssignmentError(403, undefined), strings.adminInstitutions.adminForbidden);
  assert.equal(adminAssignmentError(404, undefined), strings.adminInstitutions.adminNotFound);
  assert.equal(adminAssignmentError(500, undefined), strings.adminInstitutions.adminFailure);
});

test("the page offers a per-row add-admin control that posts to the row's institution", () => {
  assert.ok(page.includes("strings.adminInstitutions.adminToggle"), "the toggle exists");
  assert.ok(page.includes('name="admin_email"'), "the email input is named");
  assert.ok(page.includes("`/api/institutions/${institutionId}/admins`"), "the row's id builds the path");
  assert.ok(page.includes('method: "POST"'));
  assert.ok(page.includes("strings.adminInstitutions.adminAdded"), "a success notice names the roles");
  assert.ok(page.includes("adminAssignmentError(response.status"), "a failure line exists");
  assert.ok(
    page.indexOf("setAdminNotice") < page.indexOf("strings.adminInstitutions.adminAdded"),
    "the success notice is written only after a response",
  );
});

test("the BFF route forwards to the API grant path and owns the header", () => {
  assert.ok(route.includes("`/v1/admin/institutions/${id}/admins`"), "the upstream path is the grant route");
  assert.ok(route.includes("proxyJson"), "the body and header go through proxyJson");
  assert.ok(!route.includes('"Authorization"'), "the route never hand-writes the header");
});
