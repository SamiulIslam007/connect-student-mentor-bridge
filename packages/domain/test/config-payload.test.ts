import assert from "node:assert/strict";
import { test } from "node:test";

import { CONFIG_RANGES, validateConfigPayload, type ConfigPayload } from "../src/config-payload.js";

function validPayload(): ConfigPayload {
  return {
    cooling_days: 14,
    difficulty_weights: {
      ADMISSION: 1,
      INTERNSHIP: 1,
      JOB_OFFER: 1,
      SKILL_MILESTONE: 1,
      INTERVIEW: 1,
    },
    tier_multipliers: { "0": 1, "1": 1, "2": 1 },
    contribution_multipliers: { DIRECTLY_ENABLED: 1, HELPED: 1, MINOR: 1 },
    audit_sample_rate: 0.25,
  };
}

test("a valid payload passes and comes back in the fixed key order", () => {
  const result = validateConfigPayload(validPayload());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(Object.keys(result.payload), [
    "cooling_days",
    "difficulty_weights",
    "tier_multipliers",
    "contribution_multipliers",
    "audit_sample_rate",
  ]);
  assert.deepEqual(Object.keys(result.payload.difficulty_weights), [
    "ADMISSION",
    "INTERNSHIP",
    "JOB_OFFER",
    "SKILL_MILESTONE",
    "INTERVIEW",
  ]);
});

test("each out-of-range field is refused and names itself", () => {
  const cases: [string, (payload: ConfigPayload) => void][] = [
    ["cooling_days", (payload) => (payload.cooling_days = 91)],
    ["cooling_days", (payload) => (payload.cooling_days = 0)],
    ["difficulty_weights.INTERNSHIP", (payload) => (payload.difficulty_weights.INTERNSHIP = 11)],
    ["tier_multipliers.2", (payload) => (payload.tier_multipliers["2"] = -1)],
    [
      "contribution_multipliers.MINOR",
      (payload) => (payload.contribution_multipliers.MINOR = 10.5),
    ],
    ["audit_sample_rate", (payload) => (payload.audit_sample_rate = 1.01)],
    ["audit_sample_rate", (payload) => (payload.audit_sample_rate = -0.01)],
  ];
  for (const [field, mutate] of cases) {
    const payload = validPayload();
    mutate(payload);
    const result = validateConfigPayload(payload);
    assert.equal(result.ok, false, `${field} must be refused`);
    if (!result.ok) {
      assert.equal(result.field, field);
      assert.ok(result.message.length > 0);
    }
  }
});

test("a missing or extra map member is refused", () => {
  const missing = validPayload() as unknown as Record<string, unknown>;
  const weights = { ...(missing.difficulty_weights as Record<string, number>) };
  delete weights.INTERVIEW;
  missing.difficulty_weights = weights;
  const missingResult = validateConfigPayload(missing);
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) {
    assert.equal(missingResult.field, "difficulty_weights");
  }

  const extra = validPayload();
  (extra.tier_multipliers as Record<string, number>)["3"] = 1;
  const extraResult = validateConfigPayload(extra);
  assert.equal(extraResult.ok, false);
  if (!extraResult.ok) {
    assert.equal(extraResult.field, "tier_multipliers");
  }

  const unknownTopLevel = { ...validPayload(), rate_limits: {} };
  const unknownResult = validateConfigPayload(unknownTopLevel);
  assert.equal(unknownResult.ok, false);
  if (!unknownResult.ok) {
    assert.equal(unknownResult.field, "rate_limits");
  }
});

test("a non-integer cooling period is refused", () => {
  const payload = validPayload();
  payload.cooling_days = 14.5;
  const result = validateConfigPayload(payload);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.field, "cooling_days");
  }
});

test("the inclusive boundaries of every range are accepted", () => {
  const payload = validPayload();
  payload.cooling_days = CONFIG_RANGES.coolingDays.min;
  payload.audit_sample_rate = 0;
  payload.difficulty_weights.ADMISSION = 0;
  assert.equal(validateConfigPayload(payload).ok, true);

  payload.cooling_days = CONFIG_RANGES.coolingDays.max;
  payload.audit_sample_rate = 1;
  payload.difficulty_weights.ADMISSION = 10;
  assert.equal(validateConfigPayload(payload).ok, true);
});
