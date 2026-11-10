import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { deletionConfirmed } from "../lib/privacy-controls.js";

const page = readFileSync(
  fileURLToPath(new URL("../app/account/page.tsx", import.meta.url)),
  "utf8",
);

test("the delete confirmation is the account email, case-insensitive", () => {
  assert.equal(deletionConfirmed("student@example.com", "student@example.com"), true);
  assert.equal(deletionConfirmed("student@example.com", "  Student@Example.COM "), true);
  assert.equal(deletionConfirmed("student@example.com", "someone@example.com"), false);
  assert.equal(deletionConfirmed("student@example.com", ""), false);
});

test("the account page offers both privacy controls", () => {
  assert.match(page, /strings\.account\.exportLabel/);
  assert.match(page, /strings\.account\.deleteConfirm/);
  assert.match(page, /\/api\/privacy\/export/);
  assert.match(page, /\/api\/privacy\/delete/);
});

test("a mismatched email is refused before any request is sent", () => {
  // The guard sits above the fetch, so a mismatch never reaches the BFF.
  const guard = page.indexOf("deletionConfirmed(account.email, confirmEmail)");
  const call = page.indexOf('fetch("/api/privacy/delete"');
  assert.ok(guard > 0 && call > guard, "the guard must run before the request");
  assert.match(page, /setMessage\(strings\.account\.deleteMismatch\)/);
});

test("a successful deletion leaves the page signed out", () => {
  assert.match(page, /setAccount\(null\)/);
  assert.match(page, /strings\.account\.deleteDone/);
});
