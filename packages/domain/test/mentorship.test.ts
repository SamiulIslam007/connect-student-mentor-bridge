import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CADENCES,
  MENTORSHIP_STATUSES,
  SESSION_STATUSES,
  canAcknowledge,
  canComplete,
  isCadence,
  isHttpsUrl,
  nextSessionStatus,
} from "../src/mentorship.js";

test("the canonical values are the three statuses, four cadences, three session states", () => {
  assert.deepEqual([...MENTORSHIP_STATUSES], ["ACTIVE", "COMPLETED", "ENDED_EARLY"]);
  assert.deepEqual([...CADENCES], ["WEEKLY", "BIWEEKLY", "MONTHLY", "AD_HOC"]);
  assert.deepEqual([...SESSION_STATUSES], ["SCHEDULED", "HELD", "CANCELLED"]);
  assert.equal(isCadence("WEEKLY"), true);
  assert.equal(isCadence("DAILY"), false);
});

test("a session is HELD only when both confirmations exist", () => {
  assert.equal(nextSessionStatus("SCHEDULED", { student: true, mentor: false }), "SCHEDULED");
  assert.equal(nextSessionStatus("SCHEDULED", { student: false, mentor: true }), "SCHEDULED");
  assert.equal(nextSessionStatus("SCHEDULED", { student: false, mentor: false }), "SCHEDULED");
  assert.equal(nextSessionStatus("SCHEDULED", { student: true, mentor: true }), "HELD");
});

test("a terminal session does not move again", () => {
  assert.equal(nextSessionStatus("HELD", { student: true, mentor: true }), null);
  assert.equal(nextSessionStatus("CANCELLED", { student: true, mentor: true }), null);
});

test("only https links are accepted", () => {
  assert.equal(isHttpsUrl("https://meet.example.com/abc"), true);
  assert.equal(isHttpsUrl("  https://meet.example.com/abc  "), true);
  for (const refused of [
    "http://meet.example.com/abc",
    "ftp://meet.example.com/abc",
    "//meet.example.com/abc",
    "javascript:alert(1)",
    "meet.example.com/abc",
    "https://",
  ]) {
    assert.equal(isHttpsUrl(refused), false, `${refused} must be refused`);
  }
});

test("only an ACTIVE mentorship can be acknowledged or completed", () => {
  assert.equal(canAcknowledge("ACTIVE"), true);
  assert.equal(canComplete("ACTIVE"), true);
  for (const status of ["COMPLETED", "ENDED_EARLY"] as const) {
    assert.equal(canAcknowledge(status), false);
    assert.equal(canComplete(status), false);
  }
});
