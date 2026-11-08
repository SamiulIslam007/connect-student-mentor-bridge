import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTRIBUTION_LEVELS,
  OUTCOME_STATUSES,
  canWithdraw,
  coolingEndsAt,
  earnsMentorReputation,
  isContributionLevel,
  transition,
  type OutcomeAction,
  type OutcomeStatus,
} from "../src/outcome.js";

const LEGAL: [OutcomeStatus | null, OutcomeAction, OutcomeStatus][] = [
  [null, "report", "PENDING_CONFIRMATION"],
  ["PENDING_CONFIRMATION", "confirm", "CONFIRMED"],
  ["PENDING_CONFIRMATION", "dispute", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "declareConflict", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "escalate", "IN_PLATFORM_REVIEW"],
  ["PENDING_CONFIRMATION", "withdraw", "WITHDRAWN"],
  ["CONFIRMED", "withdraw", "WITHDRAWN"],
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
