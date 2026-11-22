import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTRIBUTION_LEVELS,
  OUTCOME_REPORTING_WINDOW_DAYS,
  OUTCOME_STATUSES,
  canWithdraw,
  coolingEndsAt,
  earnsMentorReputation,
  isContributionLevel,
  outcomeReportRefusal,
  reviewDecisionIsLegal,
  reviewTarget,
  transition,
  type OutcomeAction,
  type OutcomeStatus,
  type ReviewDecision,
} from "../src/outcome.js";

const LEGAL: [OutcomeStatus | null, OutcomeAction, OutcomeStatus][] = [
  [null, "report", "PENDING_CONFIRMATION"],
  ["PENDING_CONFIRMATION", "confirm", "CONFIRMED"],
  ["PENDING_CONFIRMATION", "dispute", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "declareConflict", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "escalate", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "withdraw", "WITHDRAWN"],
  ["CONFIRMED", "withdraw", "WITHDRAWN"],
  ["CONFIRMED", "auditHold", "IN_PLATFORM_REVIEW"],
  ["IN_PLATFORM_REVIEW", "withdraw", "WITHDRAWN"],
];

test("every legal pair in the data-model table resolves", () => {
  for (const [from, action, to] of LEGAL) {
    assert.equal(transition(from, action), to, `${from} + ${action}`);
  }
});

test("every other pair answers null, including COUNTED and the terminal states", () => {
  const actions: OutcomeAction[] = [
    "report",
    "confirm",
    "declareConflict",
    "dispute",
    "escalate",
    "withdraw",
    "auditHold",
  ];
  const legal = new Set(LEGAL.map(([from, action]) => `${from}:${action}`));
  for (const status of [null, ...OUTCOME_STATUSES]) {
    for (const action of actions) {
      if (legal.has(`${status}:${action}`)) {
        continue;
      }
      assert.equal(transition(status, action), null, `${status} + ${action} must be refused`);
    }
  }
});

test("only the three open states can be withdrawn", () => {
  for (const status of OUTCOME_STATUSES) {
    assert.equal(
      canWithdraw(status),
      status === "PENDING_CONFIRMATION" || status === "CONFIRMED" || status === "IN_PLATFORM_REVIEW",
      status,
    );
  }
});

test("mentor reputation needs a counted mentor-confirmed outcome with no conflict", () => {
  assert.equal(
    earnsMentorReputation({
      status: "COUNTED",
      countedBasis: "MENTOR_CONFIRMED",
      coiDeclared: false,
    }),
    true,
  );
  for (const candidate of [
    { status: "COUNTED" as const, countedBasis: "PLATFORM_DECISION", coiDeclared: false },
    { status: "COUNTED" as const, countedBasis: "MENTOR_CONFIRMED", coiDeclared: true },
    { status: "COUNTED" as const, countedBasis: null, coiDeclared: false },
    { status: "CONFIRMED" as const, countedBasis: "MENTOR_CONFIRMED", coiDeclared: false },
    { status: "IN_PLATFORM_REVIEW" as const, countedBasis: "MENTOR_CONFIRMED", coiDeclared: true },
    { status: "WITHDRAWN" as const, countedBasis: "PLATFORM_DECISION", coiDeclared: false },
  ]) {
    assert.equal(earnsMentorReputation(candidate), false, JSON.stringify(candidate));
  }
});

test("the cooling deadline is the confirmation time plus the configured days", () => {
  const confirmed = new Date("2026-11-08T00:00:00.000Z");
  assert.equal(coolingEndsAt(confirmed, 14).toISOString(), "2026-11-22T00:00:00.000Z");
  assert.equal(coolingEndsAt(confirmed, 0).toISOString(), confirmed.toISOString());
  assert.throws(() => coolingEndsAt(confirmed, -1));
});

test("the canonical contribution levels are the three documented values", () => {
  assert.deepEqual([...CONTRIBUTION_LEVELS], ["DIRECTLY_ENABLED", "HELPED", "MINOR"]);
  assert.equal(isContributionLevel("HELPED"), true);
  assert.equal(isContributionLevel("COACHED"), false);
});

const REVIEW_LEGAL: [OutcomeStatus, ReviewDecision, OutcomeStatus][] = [
  ["IN_PLATFORM_REVIEW", "valid", "COUNTED"],
  ["IN_PLATFORM_REVIEW", "invalid", "REJECTED"],
  ["COUNTED", "invalid", "REVERSED"],
];

test("the reviewer moves are exactly T8, T9, and T11", () => {
  for (const [from, decision, to] of REVIEW_LEGAL) {
    assert.equal(reviewTarget(from, decision), to, `${from} + ${decision}`);
    assert.equal(reviewDecisionIsLegal(from, decision), true);
  }
});

test("valid on a counted outcome and every other pair are illegal", () => {
  const decisions: ReviewDecision[] = ["valid", "invalid"];
  for (const from of OUTCOME_STATUSES) {
    for (const decision of decisions) {
      const legal = REVIEW_LEGAL.some(([f, d]) => f === from && d === decision);
      assert.equal(reviewDecisionIsLegal(from, decision), legal, `${from} + ${decision}`);
      assert.equal(reviewTarget(from, decision), legal ? reviewTarget(from, decision) : null);
    }
  }
  assert.equal(reviewTarget("COUNTED", "valid"), null, "no double count");
});

test("a reversed outcome cannot be reviewed again in this release", () => {
  assert.equal(reviewDecisionIsLegal("REVERSED", "valid"), false);
  assert.equal(reviewDecisionIsLegal("REVERSED", "invalid"), false);
});

/**
 * The reporting window (SEC-AUDIT-007, D-258): a live or completed mentorship,
 * 90 days from the ending instant, and `occurred_on` bounded to the mentorship.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00.000Z");

function windowInput(overrides: Partial<Parameters<typeof outcomeReportRefusal>[0]> = {}) {
  return {
    status: "ACTIVE",
    startedAt: new Date("2026-09-01T00:00:00.000Z"),
    endedAt: null,
    occurredOn: "2026-11-20",
    now: NOW,
    ...overrides,
  };
}

test("a live mentorship takes a report dated today or inside its span", () => {
  assert.equal(outcomeReportRefusal(windowInput()), null);
  assert.equal(outcomeReportRefusal(windowInput({ occurredOn: "2026-09-01" })), null);
  assert.equal(outcomeReportRefusal(windowInput({ occurredOn: "2026-11-22" })), null);
});

test("occurred_on before the start or after today is refused", () => {
  assert.equal(
    outcomeReportRefusal(windowInput({ occurredOn: "2026-08-31" })),
    "OCCURRED_ON_OUT_OF_RANGE",
  );
  assert.equal(
    outcomeReportRefusal(windowInput({ occurredOn: "2026-11-23" })),
    "OCCURRED_ON_OUT_OF_RANGE",
  );
  assert.equal(
    outcomeReportRefusal(windowInput({ occurredOn: "not-a-date" })),
    "OCCURRED_ON_OUT_OF_RANGE",
  );
});

test("a completed mentorship keeps its window for 90 days from the ending instant", () => {
  const onTheBoundary = new Date(NOW.getTime() - 90 * DAY);
  assert.equal(outcomeReportRefusal(windowInput({ status: "COMPLETED", endedAt: onTheBoundary })), null);

  const oneMillisecondLate = new Date(NOW.getTime() - 90 * DAY - 1);
  assert.equal(
    outcomeReportRefusal(windowInput({ status: "COMPLETED", endedAt: oneMillisecondLate })),
    "OUTCOME_REPORTING_CLOSED",
  );

  assert.equal(
    outcomeReportRefusal(
      windowInput({ status: "COMPLETED", endedAt: new Date(NOW.getTime() - 89 * DAY) }),
    ),
    null,
    "a recent completion still reports",
  );
});

test("a completed mentorship with no ending instant keeps its window open", () => {
  assert.equal(outcomeReportRefusal(windowInput({ status: "COMPLETED", endedAt: null })), null);
});

test("a mentorship that ended early takes no report", () => {
  assert.equal(
    outcomeReportRefusal(windowInput({ status: "ENDED_EARLY", endedAt: NOW })),
    "OUTCOME_REPORTING_CLOSED",
  );
});

test("the window length comes from config unless a caller overrides it", () => {
  assert.equal(OUTCOME_REPORTING_WINDOW_DAYS, 90);
  const ended = new Date(NOW.getTime() - 30 * DAY);
  assert.equal(
    outcomeReportRefusal(windowInput({ status: "COMPLETED", endedAt: ended, windowDays: 29 })),
    "OUTCOME_REPORTING_CLOSED",
  );
  assert.equal(
    outcomeReportRefusal(windowInput({ status: "COMPLETED", endedAt: ended, windowDays: 30 })),
    null,
  );
});
