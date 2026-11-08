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
  createdAt: Date;
  studentProfileId: string;
  mentorProfileId: string;
  fieldId: string;
  studentName: string;
  mentorName: string;
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
  };
}
