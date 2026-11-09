import type { ContributionLevel, OutcomeStatus } from "@connect/domain";

/** Wire shapes: snake_case, lowercase enum values, ids opaque. */
export interface OutcomeRecord {
  id: string;
  mentorshipId: string;
  status: OutcomeStatus;
  outcomeType: string;
  title: string | null;
  description: string;
  occurredOn: string;
  contributionClaimed: ContributionLevel;
  contributionConfirmed: ContributionLevel | null;
  evidenceTier: number;
  countedBasis: string | null;
  coiDeclared: boolean;
  isPaidRelationship: boolean;
  mentorDecisionDueAt: Date;
  confirmedAt: Date | null;
  coolingEndsAt: Date | null;
  countedAt: Date | null;
  withdrawnAt: Date | null;
  /** Present on the single-outcome read only (platform-review change). */
  decisions?: OutcomeDecision[];
  createdAt: Date;
  studentProfileId: string;
  mentorProfileId: string;
  fieldId: string;
  studentName: string;
  mentorName: string;
}

export interface OutcomeDecision {
  decision: string;
  reason: string;
  decidedAt: Date;
}

export interface ReviewInput {
  userId: string;
  outcomeId: string;
  decision: string;
  reason: string;
  requestId: string;
}

export interface ReviewQueueInput {
  limit: number;
  /** The last outcome id of the previous page. */
  cursor?: string;
}

/** One open review case; the case is derived, never stored (design D3). */
export interface ReviewCase {
  id: string;
  mentorshipId: string;
  outcomeType: string;
  description: string;
  fieldName: string;
  studentName: string;
  mentorName: string;
  caseKind: string;
  reason: string | null;
  openedAt: Date;
  waitingDays: number;
  countedBasis: string | null;
}

export interface ReviewQueuePage {
  cases: ReviewCase[];
  nextCursor: string | null;
}

export interface ReportOutcomeInput {
  userId: string;
  mentorshipId: string;
  outcomeType?: string;
  title?: string;
  description?: string;
  contributionClaimed?: string;
  occurredOn?: string;
  requestId: string;
}

export interface ListOutcomesInput {
  userId: string;
  mentorshipId?: string;
  status?: OutcomeStatus;
  limit: number;
}

export interface ConfirmOutcomeInput {
  userId: string;
  outcomeId: string;
  contributionLevel?: string;
  coiDeclaration?: unknown;
  requestId: string;
}

export interface DisputeOutcomeInput {
  userId: string;
  outcomeId: string;
  reason?: string;
  requestId: string;
}

export interface OutcomeService {
  report(input: ReportOutcomeInput): Promise<OutcomeRecord>;
  list(input: ListOutcomesInput): Promise<OutcomeRecord[]>;
  /** Participant-only; a foreign id reads as not found. */
  read(userId: string, outcomeId: string): Promise<OutcomeRecord>;
  confirm(input: ConfirmOutcomeInput): Promise<OutcomeRecord>;
  dispute(input: DisputeOutcomeInput): Promise<OutcomeRecord>;
  withdraw(userId: string, outcomeId: string, requestId: string): Promise<OutcomeRecord>;
  /** Reviewer-only; the controller enforces the role and the second factor. */
  review(input: ReviewInput): Promise<OutcomeRecord>;
  /** Platform-admin queue: open cases, oldest mentor deadline first. */
  reviewQueue(input: ReviewQueueInput): Promise<ReviewQueuePage>;
}

export function outcomePayload(outcome: OutcomeRecord): Record<string, unknown> {
  return {
    id: outcome.id,
    mentorship_id: outcome.mentorshipId,
    status: outcome.status.toLowerCase(),
    outcome_type: outcome.outcomeType.toLowerCase(),
    title: outcome.title,
    description: outcome.description,
    occurred_on: outcome.occurredOn,
    contribution_claimed: outcome.contributionClaimed.toLowerCase(),
    contribution_confirmed: outcome.contributionConfirmed?.toLowerCase() ?? null,
    evidence_tier: outcome.evidenceTier,
    counted_basis: outcome.countedBasis?.toLowerCase() ?? null,
    coi_declared: outcome.coiDeclared,
    is_paid_relationship: outcome.isPaidRelationship,
    mentor_decision_due_at: outcome.mentorDecisionDueAt,
    confirmed_at: outcome.confirmedAt,
    cooling_ends_at: outcome.coolingEndsAt,
    counted_at: outcome.countedAt,
    withdrawn_at: outcome.withdrawnAt,
    created_at: outcome.createdAt,
    student_profile_id: outcome.studentProfileId,
    mentor_profile_id: outcome.mentorProfileId,
    field_id: outcome.fieldId,
    student_name: outcome.studentName,
    mentor_name: outcome.mentorName,
    ...(outcome.decisions
      ? {
          decisions: outcome.decisions.map((decision) => ({
            decision: decision.decision,
            reason: decision.reason,
            decided_at: decision.decidedAt,
          })),
        }
      : {}),
  };
}

export function reviewCasePayload(entry: ReviewCase): Record<string, unknown> {
  return {
    id: entry.id,
    mentorship_id: entry.mentorshipId,
    outcome_type: entry.outcomeType.toLowerCase(),
    description: entry.description,
    field_name: entry.fieldName,
    student_name: entry.studentName,
    mentor_name: entry.mentorName,
    case_kind: entry.caseKind.toLowerCase(),
    reason: entry.reason,
    opened_at: entry.openedAt,
    waiting_days: entry.waitingDays,
    counted_basis: entry.countedBasis?.toLowerCase() ?? null,
  };
}
