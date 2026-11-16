/** The two states whose evidence clock has started (FR-PRIV-03, design R1/R2). */
const RETENTION_TRIGGERS = ["COUNTED", "REJECTED"] as const;

export interface EvidenceRetentionInput {
  outcomeStatus: string;
  countedAt: Date | null;
  rejectedAt: Date | null;
  now: Date;
  windowDays: number;
}

/**
 * True when an outcome's evidence file is past its retention window. Only
 * `COUNTED` and `REJECTED` start the clock — `REVERSED` and `WITHDRAWN` keep
 * their file (D-204) — and a terminal row with no instant is never due, because
 * a missing instant is a projection bug, not a licence to delete.
 */
export function evidenceRetentionDue(input: EvidenceRetentionInput): boolean {
  if (!(RETENTION_TRIGGERS as readonly string[]).includes(input.outcomeStatus)) {
    return false;
  }
  const instant = input.outcomeStatus === "COUNTED" ? input.countedAt : input.rejectedAt;
  if (!instant) {
    return false;
  }
  const windowMs = input.windowDays * 24 * 60 * 60 * 1000;
  return input.now.getTime() - instant.getTime() >= windowMs;
}
