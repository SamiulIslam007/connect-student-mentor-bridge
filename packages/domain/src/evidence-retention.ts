export interface EvidenceRetentionInput {
  outcomeStatus: string;
  countedAt: Date | null;
  rejectedAt: Date | null;
  /** A clawback's own instant: the clock restarts, it never inherits an older one. */
  reversedAt: Date | null;
  withdrawnAt: Date | null;
  /** The reporting student's earliest institution-sharing withdrawal, if any. */
  consentWithdrawnAt?: Date | null;
  /** When the bytes landed: the maximum clock for an outcome that never settles. */
  uploadedAt?: Date | null;
  now: Date;
  windowDays: number;
}

/**
 * The instant that starts the clock for a settled state. Each state reads its own
 * column; a coalesce across all four would date a clawback by the year-old count
 * it reversed (design R1).
 */
function ownInstant(input: EvidenceRetentionInput): Date | null {
  switch (input.outcomeStatus) {
    case "COUNTED":
      return input.countedAt;
    case "REJECTED":
      return input.rejectedAt;
    case "REVERSED":
      return input.reversedAt;
    case "WITHDRAWN":
      return input.withdrawnAt;
    default:
      return null;
  }
}

/**
 * True when an outcome's evidence file is past its retention window. The four
 * settled states start their own clock; an `INSTITUTION_DATA_SHARING` withdrawal
 * can only move that origin earlier, never later (D-231); and an outcome that
 * never settles is bounded by 90 days from upload (D-259). A settled row whose
 * own instant is missing is never due, because a missing instant is a projection
 * bug, not a licence to delete.
 */
export function evidenceRetentionDue(input: EvidenceRetentionInput): boolean {
  const windowMs = input.windowDays * 24 * 60 * 60 * 1000;
  const instant = ownInstant(input);
  if (!instant) {
    // The maximum: a file whose outcome never settles is deleted 90 days after
    // upload, so a pending case cannot keep private evidence indefinitely (D-259).
    return (
      input.uploadedAt !== null &&
      input.uploadedAt !== undefined &&
      input.now.getTime() - input.uploadedAt.getTime() >= windowMs
    );
  }
  const consent = input.consentWithdrawnAt;
  const origin = consent && consent.getTime() < instant.getTime() ? consent : instant;
  return input.now.getTime() - origin.getTime() >= windowMs;
}
