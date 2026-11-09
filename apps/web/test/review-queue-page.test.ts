import assert from "node:assert/strict";
import { test } from "node:test";

import {
  caseKindLabel,
  removeCase,
  reviewBody,
  waitingLabel,
  type ReviewCase,
} from "../lib/review-queue.js";
import { strings } from "../lib/strings.js";

const entry: ReviewCase = {
  id: "o-1",
  mentorship_id: "m-1",
  outcome_type: "internship",
  description: "Internship at a fintech",
  field_name: "Engineering",
  student_name: "Rahim",
  mentor_name: "Ayesha",
  case_kind: "mentor_dispute",
  reason: "Not completed",
  opened_at: "2026-11-01T00:00:00.000Z",
  waiting_days: 8,
  counted_basis: null,
};

test("case kinds and waiting time use the catalog", () => {
  assert.equal(caseKindLabel("mentor_dispute"), strings.adminReviews.kindMentorDispute);
  assert.equal(caseKindLabel("conflict_of_interest"), strings.adminReviews.kindConflict);
  assert.equal(caseKindLabel("escalated_d7"), strings.adminReviews.kindEscalated);
  assert.equal(caseKindLabel("other"), "other");
  assert.equal(waitingLabel(8), "Waiting 8 days");
  assert.equal(waitingLabel(-1), "Waiting 0 days");
});

test("a decision requires a reason of 1 to 1000 characters", () => {
  assert.deepEqual(reviewBody("valid", "   "), {
    ok: false,
    message: strings.adminReviews.reasonRequired,
  });
  assert.deepEqual(reviewBody("invalid", "x".repeat(1001)), {
    ok: false,
    message: strings.adminReviews.reasonTooLong,
  });
  assert.deepEqual(reviewBody("valid", "  The evidence supports it.  "), {
    ok: true,
    body: { decision: "valid", reason: "The evidence supports it." },
  });
});

test("a decided case leaves the list", () => {
  assert.deepEqual(removeCase([entry], "o-1"), []);
  assert.deepEqual(removeCase([entry], "other"), [entry]);
});
