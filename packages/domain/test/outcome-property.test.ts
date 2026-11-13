/**
 * FR-OUT-06 as a property test: no action sequence reaches `COUNTED` without a
 * mentor confirmation or a platform decision. Exhaustive over every pair and
 * every two- and three-step sequence from a fresh outcome, so the walk states
 * its own coverage instead of sampling (design R1, R2).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OUTCOME_ACTIONS,
  OUTCOME_STATUSES,
  reviewTarget,
  transition,
  type OutcomeAction,
  type OutcomeStatus,
  type ReviewDecision,
} from "../src/outcome.js";

type Step =
  | { readonly kind: "action"; readonly action: OutcomeAction }
  | { readonly kind: "review"; readonly decision: ReviewDecision }
  /** T7: the counting job's edge, the one move the pure function does not carry. */
  | { readonly kind: "count" };

const ACTIONS: readonly Step[] = OUTCOME_ACTIONS.map((action) => ({ kind: "action", action }) as const);

const STEPS: readonly Step[] = [
  ...ACTIONS,
  { kind: "review", decision: "valid" },
  { kind: "review", decision: "invalid" },
  { kind: "count" },
];

const NOWHERE: Record<OutcomeAction, OutcomeStatus | null> = {
  report: null,
  confirm: null,
  declareConflict: null,
  dispute: null,
  escalate: null,
  withdraw: null,
};

/** `docs/data-model.md` section 4.4 (T1 to T11) written out, so the test compares the function to the table and not to itself. */
const TABLE: Record<OutcomeStatus, Record<OutcomeAction, OutcomeStatus | null>> = {
  PENDING_CONFIRMATION: {
    ...NOWHERE,
    confirm: "CONFIRMED",
    declareConflict: "IN_PLATFORM_REVIEW",
    dispute: "IN_PLATFORM_REVIEW",
    escalate: "IN_PLATFORM_REVIEW",
    withdraw: "WITHDRAWN",
  },
  CONFIRMED: { ...NOWHERE, withdraw: "WITHDRAWN" },
  IN_PLATFORM_REVIEW: { ...NOWHERE, withdraw: "WITHDRAWN" },
  COUNTED: NOWHERE,
  REJECTED: NOWHERE,
  WITHDRAWN: NOWHERE,
  REVERSED: NOWHERE,
};

function apply(from: OutcomeStatus | null, move: Step): OutcomeStatus | null {
  if (move.kind === "action") {
    return transition(from, move.action);
  }
  if (move.kind === "review") {
    return from === null ? null : reviewTarget(from, move.decision);
  }
  // The counting job selects `CONFIRMED` rows with an expired cooling deadline
  // (services/api/src/reputation/counting-job.ts); nothing else reaches COUNTED.
  return from === "CONFIRMED" ? "COUNTED" : null;
}

function fold(trace: readonly Step[]): OutcomeStatus | null {
  return trace.reduce<OutcomeStatus | null>((state, move) => apply(state, move), null);
}

interface Node {
  readonly trace: readonly Step[];
  readonly end: OutcomeStatus | null;
}

function walk(depth: number): Node[] {
  let frontier: Node[] = [{ trace: [], end: null }];
  for (let step = 0; step < depth; step += 1) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const move of STEPS) {
        next.push({ trace: [...node.trace, move], end: apply(node.end, move) });
      }
    }
    frontier = next;
  }
  return frontier;
}

function describe(node: Node): string {
  const moves = node.trace.map((move) =>
    move.kind === "action" ? move.action : move.kind === "review" ? `review:${move.decision}` : "count",
  );
  return `${moves.join(" then ")} = ${node.end ?? "no state"}`;
}

test("pair depth: every (state, action) pair equals the data-model table", () => {
  const states = Object.keys(TABLE).length;
  const actions = Object.keys(TABLE.PENDING_CONFIRMATION).length;
  assert.equal(states * actions, 42, "the table is 7 states by 6 actions");
  let visited = 0;
  for (const from of OUTCOME_STATUSES) {
    for (const action of OUTCOME_ACTIONS) {
      assert.equal(transition(from, action), TABLE[from][action], `${from} then ${action}`);
      visited += 1;
    }
  }
  assert.equal(
    visited,
    OUTCOME_STATUSES.length * OUTCOME_ACTIONS.length,
    `pair coverage: visited ${visited} of ${OUTCOME_STATUSES.length} states by ${OUTCOME_ACTIONS.length} actions`,
  );
  assert.equal(
    visited,
    states * actions,
    `pair coverage: visited ${visited} of the table's ${states * actions} pairs`,
  );
});

test("two-step depth: the reachable set is the fold of the pure function", () => {
  const nodes = walk(2);
  assert.equal(nodes.length, STEPS.length ** 2, "two-step coverage");
  for (const node of nodes) {
    assert.equal(node.end, fold(node.trace), describe(node));
  }
  const reachable = [...new Set(nodes.map((node) => node.end).filter((end) => end !== null))].sort();
  assert.deepEqual(reachable, [
    "CONFIRMED",
    "IN_PLATFORM_REVIEW",
    "PENDING_CONFIRMATION",
    "WITHDRAWN",
  ]);
});

test("three-step depth: the reachable set gains COUNTED, and every trace folds", () => {
  const nodes = walk(3);
  assert.equal(nodes.length, STEPS.length ** 3, "three-step coverage");
  for (const node of nodes) {
    assert.equal(node.end, fold(node.trace), describe(node));
  }
  const reachable = [...new Set(nodes.map((node) => node.end).filter((end) => end !== null))].sort();
  assert.deepEqual(reachable, [
    "CONFIRMED",
    "COUNTED",
    "IN_PLATFORM_REVIEW",
    "PENDING_CONFIRMATION",
    "REJECTED",
    "WITHDRAWN",
  ]);
  assert.ok(
    nodes.some((node) => node.end === "COUNTED"),
    "the three-step walk must reach COUNTED, or the invariant below proves nothing",
  );
});

test("invariant: no three-step trace reaches COUNTED without a confirmation or a platform decision", () => {
  const counted = walk(3).filter((node) => node.end === "COUNTED");
  assert.ok(counted.length > 0, "COUNTED traces exist");
  for (const node of counted) {
    const confirmed = node.trace.some((move) => move.kind === "action" && move.action === "confirm");
    const decided = node.trace.some((move) => move.kind === "review" && move.decision === "valid");
    assert.ok(confirmed || decided, `COUNTED without CONFIRM or REVIEW_VALID: ${describe(node)}`);
  }
  const rejected = walk(3).filter((node) => node.end === "REJECTED");
  assert.ok(rejected.length > 0, "REJECTED traces exist");
  for (const node of rejected) {
    assert.ok(
      node.trace.some((move) => move.kind === "review" && move.decision === "invalid"),
      `REJECTED without a review decision: ${describe(node)}`,
    );
  }
});
