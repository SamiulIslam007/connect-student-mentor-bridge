import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasScoreKey,
  impactState,
  outcomeLabel,
  renderRows,
  type ImpactReport,
} from "../lib/impact-view.js";
import { strings } from "../lib/strings.js";

const report: ImpactReport = {
  data: [
    { field_id: "f-1", field_name: "Engineering", outcome_type: "internship", count: 2 },
    { field_id: "f-1", field_name: "Engineering", outcome_type: "interview", count: 1 },
  ],
  counted_outcomes: 3,
};

test("loading, error, empty, and ready are distinct states", () => {
  assert.equal(impactState({ loaded: false, failed: false, rows: [] }), "loading");
  assert.equal(impactState({ loaded: true, failed: true, rows: [] }), "error");
  assert.equal(impactState({ loaded: true, failed: false, rows: [] }), "empty");
  assert.equal(impactState({ loaded: true, failed: false, rows: report.data }), "ready");
});

test("rows render the field, the labelled outcome type, and the count", () => {
  assert.deepEqual(renderRows(report), [
    { field: "Engineering", type: strings.impact.outcomeInternship, count: "2" },
    { field: "Engineering", type: strings.impact.outcomeInterview, count: "1" },
  ]);
  assert.equal(outcomeLabel("JOB_OFFER"), strings.impact.outcomeJobOffer);
  assert.equal(outcomeLabel("unknown"), "unknown");
});

test("the rendered row carries no score, tier, or percentage", () => {
  for (const row of renderRows(report)) {
    assert.deepEqual(Object.keys(row).sort(), ["count", "field", "type"]);
  }
  const rendered = Object.values(renderRows(report)[0]).join(" ");
  assert.doesNotMatch(rendered, /%|score|points|tier/i);
});

test("a payload with a score-like key is detected and refused by the view", () => {
  assert.equal(hasScoreKey({ data: [], counted_outcomes: 1 }), false);
  for (const key of ["score", "points", "tier", "ranking", "percentage"]) {
    assert.equal(hasScoreKey({ [key]: 1 }), true, key);
  }
});
