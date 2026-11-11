import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EMPTY_REASON_MESSAGE,
  claimLine,
  decisionBody,
  readClaims,
  type PendingClaim,
} from "../lib/attestations.js";

function claim(overrides: Partial<PendingClaim> = {}): PendingClaim {
  return {
    id: "claim-1",
    display_name: "Ayesha Rahman",
    email_domain: "student.example.edu",
    kind: "alumnus",
    department: "CSE",
    program: "BSc",
    batch_year: 2022,
    claimed_at: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

test("a claim line names only the declared facts, in one line", () => {
  assert.equal(claimLine(claim()), "Ayesha Rahman · student.example.edu · alumnus · CSE · BSc · 2022");
});

test("a claim line skips a missing optional part instead of printing null", () => {
  assert.equal(
    claimLine(claim({ email_domain: null, department: null, program: null, batch_year: null })),
    "Ayesha Rahman · alumnus",
  );
});

test("an empty or malformed queue reads as empty", () => {
  assert.deepEqual(readClaims(null), []);
  assert.deepEqual(readClaims({}), []);
  assert.deepEqual(readClaims({ data: [{ id: 1 }] }), []);
  assert.equal(readClaims({ data: [claim()] }).length, 1);
});

test("the decision body refuses a blank reason before any request", () => {
  const blank = decisionBody("verify", "   ");
  assert.equal(blank.ok, false);
  assert.equal(blank.ok === false ? blank.message : "", EMPTY_REASON_MESSAGE);
});

test("the decision body carries the trimmed reason", () => {
  const built = decisionBody("reject", "  the registrar has no record  ");
  assert.equal(built.ok, true);
  assert.deepEqual(built.ok === true ? built.body : null, {
    decision: "reject",
    reason: "the registrar has no record",
  });
});

test("the page wires the queue, the reason field and both decisions", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../app/institution/attestations/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(source.includes("/api/institution/attestations"), "the page reads the queue route");
  assert.ok(source.includes("decisionBody("), "the reason rule is applied before sending");
  assert.ok(source.includes("strings.attestations.empty"), "the empty state is a catalog line");
  assert.ok(source.includes("strings.attestations.error"), "the error state is a catalog line");
  assert.ok(source.includes('"verify"') && source.includes('"reject"'), "both decisions exist");
  assert.ok(
    source.indexOf("/decide") > 0,
    "a decision posts to the nested decide route",
  );
});
