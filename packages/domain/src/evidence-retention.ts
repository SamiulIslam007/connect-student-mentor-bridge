/** The four states whose evidence clock has started (FR-PRIV-03, D-230). */
const RETENTION_TRIGGERS = ["COUNTED", "REJECTED", "REVERSED", "WITHDRAWN"] as const;

export interface EvidenceRetentionInput {
  outcomeStatus: string;
  countedAt: Date | null;
  rejectedAt: Date | null;
  /** A clawback's own instant: the clock restarts, it never inherits an older one. */
  reversedAt: Date | null;
  withdrawnAt: Date | null;
  /** The reporting student's earliest institution-sharing withdrawal, if any. */
  consentWithdrawnAt?: Date | null;
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
 * can only move that origin earlier, never later (D-231); and a terminal row
 * whose own instant is missing is never due, because a missing instant is a
 * projection bug, not a licence to delete.
 */
export function evidenceRetentionDue(input: EvidenceRetentionInput): boolean {
  if (!(RETENTION_TRIGGERS as readonly string[]).includes(input.outcomeStatus)) {
    return false;
  }
  const instant = ownInstant(input);
  if (!instant) {
    return false;
  }
  const consent = input.consentWithdrawnAt;
  const origin = consent && consent.getTime() < instant.getTime() ? consent : instant;
  const windowMs = input.windowDays * 24 * 60 * 60 * 1000;
  return input.now.getTime() - origin.getTime() >= windowMs;
}
