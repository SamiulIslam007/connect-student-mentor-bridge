import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

import {
  isStale,
  labelFor,
  purposesForContext,
  stalePurposes,
  stateTextFor,
  type ConsentState,
} from "../lib/consents.js";
import { strings } from "../lib/strings.js";

function state(overrides: Partial<ConsentState> = {}): ConsentState {
  return {
    purpose: "TERMS",
    current_version: CONSENT_DOCUMENT_VERSION,
    accepted_version: CONSENT_DOCUMENT_VERSION,
    action: "GRANTED",
    institution_id: null,
    ...overrides,
  };
}

const page = readFileSync(
  fileURLToPath(new URL("../app/consent/page.tsx", import.meta.url)),
  "utf8",
);
const nav = readFileSync(
  fileURLToPath(new URL("../app/session-nav.tsx", import.meta.url)),
  "utf8",
);

test("a mentor can hold the volunteer agreement; a student without an affiliation cannot share", () => {
  const mentor = purposesForContext({ isMentor: true, hasAffiliation: true });
  assert.ok(mentor.includes("VOLUNTEER_AGREEMENT"), "a mentor accepts the agreement");
  assert.ok(mentor.includes("INSTITUTION_DATA_SHARING"), "a mentor with an affiliation can share");

  const student = purposesForContext({ isMentor: false, hasAffiliation: true });
  assert.ok(!student.includes("VOLUNTEER_AGREEMENT"), "a student is not a volunteer mentor");
  assert.ok(student.includes("INSTITUTION_DATA_SHARING"));

  const unaffiliated = purposesForContext({ isMentor: false, hasAffiliation: false });
  assert.ok(!unaffiliated.includes("INSTITUTION_DATA_SHARING"), "no affiliation, no sharing");
  assert.deepEqual(unaffiliated, ["TERMS", "PRIVACY_NOTICE", "COMMUNITY_GUIDELINES"]);
});

test("a matching version is not stale; a different or newer one is", () => {
  assert.equal(isStale(state()), false);
  assert.equal(isStale(state({ accepted_version: "2025-01" })), true);
  assert.equal(isStale(state({ accepted_version: null, action: null })), false, "never accepted is not stale");
  assert.equal(stalePurposes([state(), state({ purpose: "PRIVACY_NOTICE", accepted_version: "2025-01" })])
    .length, 1);
});

test("every purpose has its own label and its own state line", () => {
  for (const purpose of ["TERMS", "PRIVACY_NOTICE", "VOLUNTEER_AGREEMENT", "COMMUNITY_GUIDELINES", "INSTITUTION_DATA_SHARING"]) {
    assert.notEqual(labelFor(purpose), purpose, `${purpose} has a catalog label`);
  }
  assert.equal(stateTextFor(state()), strings.consent.stateAccepted);
  assert.equal(stateTextFor(state({ action: "WITHDRAWN", accepted_version: null })), strings.consent.stateWithdrawn);
  assert.equal(stateTextFor(state({ action: null, accepted_version: null })), strings.consent.stateNotAccepted);
  assert.equal(stateTextFor(state({ accepted_version: "2025-01" })), strings.consent.stateStale);
});

test("the consent page calls one BFF route and carries the three states", () => {
  assert.ok(page.includes('fetch("/api/me/consents")'), "the read comes from the BFF route");
  assert.ok(page.includes('fetch("/api/me/consents", {'), "the write goes to the same route");
  assert.ok(page.includes("strings.consent.loading"), "a loading state exists");
  assert.ok(page.includes("strings.consent.failed"), "an error state exists");
  assert.ok(page.includes("strings.consent.recorded"), "a confirmation notice exists");
  assert.ok(page.includes('method: "POST"'));
  assert.ok(!page.includes("Bearer"), "the page never builds an Authorization header");
});

test("the header shows the re-acceptance banner only for a stale purpose", () => {
  assert.ok(nav.includes("stalePurposes"), "the banner uses the version-mismatch helper");
  assert.ok(nav.includes('href="/consent"'), "the banner links to the consent page");
  assert.ok(nav.includes("strings.consent.banner"));
});
