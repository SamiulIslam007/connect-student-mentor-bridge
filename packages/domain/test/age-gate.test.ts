import assert from "node:assert/strict";
import { test } from "node:test";

import { AGE_GATE_VERSION, isAtLeast18, isCalendarDate } from "../src/index.js";

test("the 18th birthday boundary is inclusive", () => {
  const birthday = "2008-11-03";

  assert.equal(isAtLeast18(birthday, new Date("2026-11-02T12:00:00Z")), false);
  assert.equal(isAtLeast18(birthday, new Date("2026-11-03T00:00:00Z")), true);
  assert.equal(isAtLeast18(birthday, new Date("2026-11-03T23:59:59Z")), true);
});

test("a leap-day birth date is treated as 28 February in non-leap years", () => {
  const birthday = "2008-02-29";

  assert.equal(isAtLeast18(birthday, new Date("2026-02-27T23:59:59Z")), false);
  assert.equal(isAtLeast18(birthday, new Date("2026-02-28T00:00:00Z")), true);
  assert.equal(isAtLeast18(birthday, new Date("2026-03-01T00:00:00Z")), true);
});

test("an under-18 date is rejected and a future date is not an adult", () => {
  const now = new Date("2026-11-03T00:00:00Z");

  assert.equal(isAtLeast18("2009-01-01", now), false);
  assert.equal(isAtLeast18("2026-11-03", now), false);
});

test("an unparseable date of birth is never accepted", () => {
  const now = new Date("2026-11-03T00:00:00Z");

  assert.equal(isAtLeast18("", now), false);
  assert.equal(isAtLeast18("03/11/2008", now), false);
  assert.equal(isAtLeast18("2008-02-31", now), false);
  assert.equal(isAtLeast18("2008-13-01", now), false);
  assert.equal(isCalendarDate("2008-02-29"), true);
  assert.equal(isCalendarDate("2008-02-31"), false);
});

test("the wording version is a stable identifier", () => {
  assert.match(AGE_GATE_VERSION, /^age-gate-\d{4}-\d{2}$/);
});
