/**
 * Outcome state machine and reputation eligibility (spec:
 * mentorship/outcome-verification; docs/data-model.md §4.4). Pure: no database
 * or HTTP import, so the service, the sweeper, and the web app cannot disagree.
 */

export const OUTCOME_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PLATFORM_REVIEW",
  "COUNTED",
  "REJECTED",
  "WITHDRAWN",
  "REVERSED",
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** The actions this change exposes; counting and review are later changes. */
export const OUTCOME_ACTIONS = [
  "report",
  "confirm",
  "declareConflict",
  "dispute",
  "escalate",
  "withdraw",
] as const;
export type OutcomeAction = (typeof OUTCOME_ACTIONS)[number];

/** The three states a student may withdraw from (data-model T10). */
export const OUTCOME_OPEN_STATUSES: readonly OutcomeStatus[] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PLATFORM_REVIEW",
];

/**
 * `null` means the move is not in the data-model table, so the service answers
 * `409 OUTCOME_INVALID_STATE` and writes nothing (design D1).
 */
export function transition(from: OutcomeStatus | null, action: OutcomeAction): OutcomeStatus | null {
  if (from === null) {
    return action === "report" ? "PENDING_CONFIRMATION" : null;
  }
  switch (action) {
    case "report":
      return null;
    case "confirm":
      return from === "PENDING_CONFIRMATION" ? "CONFIRMED" : null;
    case "declareConflict":
    case "dispute":
    case "escalate":
      return from === "PENDING_CONFIRMATION" ? "IN_PLATFORM_REVIEW" : null;
    case "withdraw":
      return OUTCOME_OPEN_STATUSES.includes(from) ? "WITHDRAWN" : null;
  }
}

export function canWithdraw(status: OutcomeStatus): boolean {
  return OUTCOME_OPEN_STATUSES.includes(status);
}

/** Canonical contribution levels (docs/data-model.md §4.1). */
export const CONTRIBUTION_LEVELS = ["DIRECTLY_ENABLED", "HELPED", "MINOR"] as const;
export type ContributionLevel = (typeof CONTRIBUTION_LEVELS)[number];

export function isContributionLevel(value: string): value is ContributionLevel {
  return (CONTRIBUTION_LEVELS as readonly string[]).includes(value);
}

export const OUTCOME_FIELD_LIMITS = {
  title: 200,
  description: 2_000,
  reason: 1_000,
} as const;

/** A mentor has seven days to decide before the sweeper escalates (T1, T5). */
export const MENTOR_DECISION_DAYS = 7;

/** Reminder days for the sweeper (T5 side effects). */
export const REMINDER_DAYS = { first: 3, second: 5 } as const;

export interface ReputationCandidate {
  status: OutcomeStatus;
  countedBasis: string | null;
  coiDeclared: boolean;
}

/**
 * `OUT-Q1` as code (D-63): only a counted outcome whose basis is a mentor
 * confirmation, with no declared conflict, can ever produce mentor reputation.
 * A platform-decided outcome never does, whatever a reviewer decides.
 */
export function earnsMentorReputation(outcome: ReputationCandidate): boolean {
  return (
    outcome.status === "COUNTED" &&
    outcome.countedBasis === "MENTOR_CONFIRMED" &&
    outcome.coiDeclared === false
  );
}

/** The cooling deadline is `confirmed_at` plus the configured period (design D4). */
export function coolingEndsAt(confirmedAt: Date, days: number): Date {
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("cooling days must be a non-negative number");
  }
  return new Date(confirmedAt.getTime() + days * 24 * 60 * 60 * 1000);
}
