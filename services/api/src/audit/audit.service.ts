import type { AuditAction } from "../identity/audit-log.js";

/**
 * The action filter accepts exactly the closed union the writers use, so a typo
 * is a `422` instead of an empty page (design R3).
 */
export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "EMAIL_VERIFIED",
  "ACCOUNT_ACTIVATED",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "SIGN_IN_SUCCEEDED",
  "SIGN_IN_FAILED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "SIGNED_OUT",
  "SIGNED_OUT_EVERYWHERE",
  "MFA_ENROLLED",
  "MFA_VERIFIED",
  "MFA_VERIFICATION_FAILED",
  "MFA_DISABLED",
  "SESSION_REVOKED",
  "ROLE_GRANTED",
  "AFFILIATION_GRANTED",
  "AFFILIATION_REJECTED",
  "AFFILIATION_REVOKED",
  "PROVIDER_SIGN_IN",
  "OUTCOME_REPORTED",
  "OUTCOME_CONFIRMED",
  "OUTCOME_DISPUTED",
  "OUTCOME_COI_DECLARED",
  "OUTCOME_ESCALATED",
  "OUTCOME_WITHDRAWN",
  "OUTCOME_REVIEWED",
  "OUTCOME_REVERSED",
  "ACCOUNT_DELETED",
  "REPORT_RESOLVED",
  "INSTITUTION_CREATED",
  "INSTITUTION_DOMAIN_REGISTERED",
  "THREAD_BREAK_GLASS_READ",
  "CONSENT_GRANTED",
  "CONSENT_WITHDRAWN",
  "ORIENTATION_COMPLETED",
] as const satisfies readonly AuditAction[];

/**
 * The object types the writers actually store, in their real letter case: the
 * column is text and older writers used upper case, so the filter matches
 * exactly and the admin page offers these values in a select.
 */
export const AUDIT_OBJECT_TYPES = [
  "users",
  "sessions",
  "two_factors",
  "role_assignments",
  "AFFILIATION",
  "INSTITUTION",
  "MENTORSHIP",
  "MENTOR_PROFILE",
  "CONSENT_RECORD",
  "outcomes",
  "reports",
] as const;

export interface AuditReadFilters {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  /** Inclusive UTC bounds; the route turns its dates into these instants. */
  from?: Date;
  to?: Date;
}

export interface AuditReadInput {
  limit: number;
  cursor?: string;
  filters: AuditReadFilters;
}

/**
 * The row as a reviewer reads it. `metadata`, `prev_hash` and `hash` are not in
 * this shape and are never selected (design R2).
 */
export interface AuditReadRow {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  objectType: string;
  objectId: string | null;
  requestId: string;
  breakGlass: boolean;
  reason: string | null;
}

export interface AuditReadPage {
  rows: AuditReadRow[];
  nextCursor: string | null;
}

export interface AuditService {
  list(input: AuditReadInput): Promise<AuditReadPage>;
}
