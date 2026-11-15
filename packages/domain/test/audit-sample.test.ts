import assert from "node:assert/strict";
import { test } from "node:test";

import { auditSampleDraw, shouldSample } from "../src/audit-sample.js";

function syntheticId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("the same outcome id always draws the same answer", () => {
  const id = "8d1c0f5e-3a4b-4c2d-9e1f-0a1b2c3d4e5f";
  const first = shouldSample({ outcomeId: id, outcomeType: "SKILL_MILESTONE" });
  for (let run = 0; run < 5; run += 1) {
    assert.equal(shouldSample({ outcomeId: id, outcomeType: "SKILL_MILESTONE" }), first);
    assert.equal(auditSampleDraw(id), auditSampleDraw(id));
  }
  assert.ok(["SAMPLED", "SKIPPED"].includes(first));
});

test("the draw spreads ids either side of the configured rate", () => {
  // Measured at 0.25 over 1000 synthetic ids: the band is stated so a broken
  // hash (a constant, or a draw that ignores the id) fails rather than passes.
  let selected = 0;
  for (let index = 0; index < 1000; index += 1) {
    if (auditSampleDraw(syntheticId(index)) < 0.25) {
      selected += 1;
    }
  }
  assert.ok(selected > 200, `a 25% rate must select more than 200 of 1000 (got ${selected})`);
  assert.ok(selected < 300, `a 25% rate must select fewer than 300 of 1000 (got ${selected})`);
});

test("the three high-consequence types are always selected, whatever the id", () => {
  for (const outcomeType of ["ADMISSION", "INTERNSHIP", "JOB_OFFER"]) {
    for (let index = 0; index < 50; index += 1) {
      assert.equal(shouldSample({ outcomeId: syntheticId(index), outcomeType }), "ALWAYS");
    }
    // The rate does not apply to them: a zero rate still selects them.
    assert.equal(shouldSample({ outcomeId: syntheticId(1), outcomeType, rate: 0 }), "ALWAYS");
  }
});

test("a type outside the list follows the rate", () => {
  // A zero rate selects nothing, a full rate selects everything.
  assert.equal(shouldSample({ outcomeId: syntheticId(7), outcomeType: "SKILL_MILESTONE", rate: 0 }), "SKIPPED");
  assert.equal(shouldSample({ outcomeId: syntheticId(7), outcomeType: "INTERVIEW", rate: 1 }), "SAMPLED");
});
