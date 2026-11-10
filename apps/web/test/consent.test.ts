import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

import { canSubmitSignUp, consentDocument } from "../lib/consent-document.js";
import { strings } from "../lib/strings.js";

function pageSource(name: "terms" | "privacy"): string {
  return readFileSync(
    fileURLToPath(new URL(`../app/${name}/page.tsx`, import.meta.url)),
    "utf8",
  );
}

test("both documents render the version the API stores on a consent record", () => {
  for (const kind of ["terms", "privacy"] as const) {
    const document = consentDocument(kind);
    assert.equal(document.version, CONSENT_DOCUMENT_VERSION);
    assert.equal(document.version, "2026-11", "the version the integration test reads back");
    assert.equal(document.draftNotice, strings.legal.draftNotice);
    assert.match(document.draftNotice, /pilot draft, pending legal review/i);
    assert.ok(document.sections.length > 0, `${kind} must have sections`);
  }
});

test("neither page repeats the version as its own literal", () => {
  for (const name of ["terms", "privacy"] as const) {
    const source = pageSource(name);
    assert.doesNotMatch(source, /2026-11/, `${name} must not hard-code the version`);
    assert.match(source, /consentDocument\("/, `${name} must read the shared view`);
  }
});

test("the pages read no session, so an unauthenticated visitor gets the text", () => {
  for (const name of ["terms", "privacy"] as const) {
    const source = pageSource(name);
    for (const sessionRead of ["cookies(", "headers(", "fetch(", "redirect(", "getSession"]) {
      assert.ok(!source.includes(sessionRead), `${name} must not use ${sessionRead}`);
    }
  }
});

test("the sign-up submit stays blocked until the consent box is ticked", () => {
  assert.equal(canSubmitSignUp(false), false);
  assert.equal(canSubmitSignUp(true), true);
  assert.ok(strings.signUp.consentRequired.length > 0);
});
