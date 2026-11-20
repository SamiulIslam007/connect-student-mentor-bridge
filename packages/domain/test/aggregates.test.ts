import assert from "node:assert/strict";
import { test } from "node:test";

import { withheldMetrics, withholdBelowFloor } from "../src/aggregates.js";

test("a count below the floor is withheld and the floor itself is reported", () => {
  assert.equal(withholdBelowFloor(0, 5), null);
  assert.equal(withholdBelowFloor(4, 5), null);
  assert.equal(withholdBelowFloor(5, 5), 5);
  assert.equal(withholdBelowFloor(9, 5), 9);
});

test("a floor of zero withholds nothing", () => {
  assert.equal(withholdBelowFloor(0, 0), 0);
  assert.equal(withholdBelowFloor(1, 0), 1);
});

test("a negative or fractional count is refused rather than reported", () => {
  assert.throws(() => withholdBelowFloor(-1, 5));
  assert.throws(() => withholdBelowFloor(1.5, 5));
  assert.throws(() => withholdBelowFloor(5, -1));
});

test("the suppressed list names only the counts below the floor, in a stable order", () => {
  const counts = { verified_alumni: 4, active_mentors: 5, requests_received: 0 };
  assert.deepEqual(withheldMetrics(counts, 5), ["requests_received", "verified_alumni"]);
  assert.deepEqual(withheldMetrics(counts, 5), withheldMetrics(counts, 5));
  assert.deepEqual(withheldMetrics(counts, 0), []);
});
