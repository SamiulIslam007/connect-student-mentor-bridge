import type { AffiliationKind, AffiliationLevel } from "@connect/domain";

/**
 * The institution-admin attestation surface (spec: institutions/affiliation-verification).
 * Ids are opaque; no applicant email local part, biography, goal, availability or
 * capacity ever reaches a reviewer (D-101).
 */

export interface PendingClaimRecord {
  id: string;
  applicantName: string;
  /** The domain only; computed in SQL so the local part stays in the database. */
  emailDomain: string | null;
  kind: AffiliationKind;
  department: string | null;
  program: string | null;
  batchYear: number | null;
  claimedAt: Date;
}

export interface DecidedClaimRecord {
  id: string;
  status: "VERIFIED" | "REJECTED";
  level: AffiliationLevel;
  method: "INSTITUTIONAL_EMAIL" | "ADMIN_ATTESTATION" | "EMPLOYER_EMAIL" | "PROFESSIONAL_LINK";
  verifiedAt: Date | null;
}

export const CLAIM_DECISIONS = ["verify", "reject"] as const;
export type ClaimDecision = (typeof CLAIM_DECISIONS)[number];

/** The field limit, and the number the refusal message states. */
export const DECISION_REASON_MAX_LENGTH = 1_000;

export interface DecideClaimInput {
  claimId: string;
  actorUserId: string;
  /** The institution ids the acting account administers. */
  institutionIds: string[];
  decision: ClaimDecision;
  reason: string;
  requestId: string;
}

export interface AttestationsService {
  /** Pending claims of the caller's institutions only, ordered by claim id. */
  listPendingClaims(institutionIds: string[]): Promise<PendingClaimRecord[]>;
  decideClaim(input: DecideClaimInput): Promise<DecidedClaimRecord>;
  /** Resolves an account by email and refuses an unknown institution or email. */
  resolveGrantTarget(input: { institutionId: string; email: string }): Promise<string>;
}

/** The queue entry's wire shape; the key set is asserted by a test. */
export function pendingClaimPayload(claim: PendingClaimRecord): Record<string, unknown> {
  return {
    id: claim.id,
    display_name: claim.applicantName,
    email_domain: claim.emailDomain,
    kind: claim.kind.toLowerCase(),
    department: claim.department,
    program: claim.program,
    batch_year: claim.batchYear,
    claimed_at: claim.claimedAt,
  };
}

export function decidedClaimPayload(claim: DecidedClaimRecord): Record<string, unknown> {
  return {
    id: claim.id,
    status: claim.status.toLowerCase(),
    level: claim.level.toLowerCase(),
    method: claim.method.toLowerCase(),
    verified_at: claim.verifiedAt,
  };
}
