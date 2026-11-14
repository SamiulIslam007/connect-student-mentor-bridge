import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OUTCOME_TYPES,
  actionsFor,
  contributionLabel,
  outcomeStatusLabel,
  outcomeTypeLabel,
  platformDecidedLabel,
  validateReport,
} from "../lib/outcome-view.js";
import { strings } from "../lib/strings.js";

test("every status has a catalog label and an unknown status falls through", () => {
  for (const status of [
    "pending_confirmation",
    "confirmed",
    "in_platform_review",
    "counted",
    "rejected",
    "withdrawn",
    "reversed",
  ]) {
    const label = outcomeStatusLabel(status);
    assert.ok((Object.values(strings.outcome) as string[]).includes(label), status);
  }
  assert.equal(outcomeStatusLabel("something_else"), "something_else");
});

test("the five documented outcome types are the only choices", () => {
  assert.deepEqual([...OUTCOME_TYPES], [
    "ADMISSION",
    "INTERNSHIP",
    "JOB_OFFER",
    "SKILL_MILESTONE",
    "INTERVIEW",
  ]);
  assert.equal(outcomeTypeLabel("job_offer"), strings.outcome.typeJobOffer);
  assert.equal(outcomeTypeLabel("unknown"), "unknown");
});

test("contribution levels are labelled and a missing one is null", () => {
  assert.equal(contributionLabel("heLped"), strings.outcome.contributionHelped);
  assert.equal(contributionLabel("DIRECTLY_ENABLED"), strings.outcome.contributionDirectlyEnabled);
  assert.equal(contributionLabel("minor"), strings.outcome.contributionMinor);
  assert.equal(contributionLabel(null), null);
});

test("only a pending outcome offers confirm and dispute, and withdrawal follows the open states", () => {
  assert.deepEqual(actionsFor("pending_confirmation"), {
    canConfirm: true,
    canDispute: true,
    canWithdraw: true,
  });
  assert.deepEqual(actionsFor("confirmed"), {
    canConfirm: false,
    canDispute: false,
    canWithdraw: true,
  });
  assert.deepEqual(actionsFor("in_platform_review"), {
    canConfirm: false,
    canDispute: false,
    canWithdraw: true,
  });
  for (const closed of ["counted", "rejected", "withdrawn", "reversed"]) {
    assert.deepEqual(actionsFor(closed), {
      canConfirm: false,
      canDispute: false,
      canWithdraw: false,
    });
  }
});

test("the platform-decided label appears only for a platform basis", () => {
  assert.equal(platformDecidedLabel("platform_decision"), strings.outcome.platformDecided);
  assert.equal(platformDecidedLabel("mentor_confirmed"), "");
  assert.equal(platformDecidedLabel(null), "");
});

test("a report is refused before the round trip when a field is invalid", () => {
  assert.deepEqual(
    validateReport({ description: "   ", outcomeType: "INTERNSHIP", contribution: "HELPED" }),
    { ok: false, message: strings.outcome.descriptionRequired },
  );
  assert.equal(
    validateReport({
      description: "x".repeat(2_001),
      outcomeType: "INTERNSHIP",
      contribution: "HELPED",
    }).ok,
    false,
  );
  assert.equal(
    validateReport({ description: "Offer", outcomeType: "PROMOTION", contribution: "HELPED" }).ok,
    false,
  );
  assert.equal(
    validateReport({ description: "Offer", outcomeType: "INTERNSHIP", contribution: "TOTAL" }).ok,
    false,
  );
  assert.deepEqual(
    validateReport({ description: "Offer", outcomeType: "INTERNSHIP", contribution: "HELPED" }),
    { ok: true },
  );
});

test("a held outcome keeps the withdraw action and the review label", () => {
  // The audit hold (T6) lands an outcome in `in_platform_review`, where the
  // screen must still offer the student a way out and name the state.
  assert.equal(actionsFor("in_platform_review").canWithdraw, true);
  assert.equal(outcomeStatusLabel("in_platform_review"), strings.outcome.statusReview);
});
