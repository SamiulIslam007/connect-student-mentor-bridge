import type { AuditAction } from "../identity/audit-log.js";

/**
 * Every action, once, as a map keyed by the union itself: a new member of
 * `AuditAction` cannot be forgotten here, which is how `ACCOUNT_WARNED` went
 * missing (D-153). The filter then accepts exactly what the writers use, so a
 * typo is a `422` instead of an empty page (design R3).
 */
const AUDIT_ACTION_MAP: Record<AuditAction, true> = {
  USER_REGISTERED: true,
  EMAIL_VERIFIED: true,
  ACCOUNT_ACTIVATED: true,
  ACCOUNT_SUSPENDED: true,
  ACCOUNT_DEACTIVATED: true,
  SIGN_IN_SUCCEEDED: true,
  SIGN_IN_FAILED: true,
  PASSWORD_RESET_REQUESTED: true,
  PASSWORD_RESET_COMPLETED: true,
  SIGNED_OUT: true,
  SIGNED_OUT_EVERYWHERE: true,
  MFA_ENROLLED: true,
  MFA_VERIFIED: true,
  MFA_VERIFICATION_FAILED: true,
  MFA_DISABLED: true,
  SESSION_REVOKED: true,
  ROLE_GRANTED: true,
  AFFILIATION_GRANTED: true,
  AFFILIATION_REJECTED: true,
  AFFILIATION_REVOKED: true,
  PROVIDER_SIGN_IN: true,
  OUTCOME_REPORTED: true,
  OUTCOME_CONFIRMED: true,
  OUTCOME_DISPUTED: true,
  OUTCOME_COI_DECLARED: true,
  OUTCOME_ESCALATED: true,
  OUTCOME_WITHDRAWN: true,
  OUTCOME_REVIEWED: true,
  OUTCOME_REVERSED: true,
  ACCOUNT_DELETED: true,
  REPORT_RESOLVED: true,
  INSTITUTION_CREATED: true,
  INSTITUTION_DOMAIN_REGISTERED: true,
  THREAD_BREAK_GLASS_READ: true,
  CONSENT_GRANTED: true,
  CONSENT_WITHDRAWN: true,
  ORIENTATION_COMPLETED: true,
  ACCOUNT_WARNED: true,
  ACCOUNT_REINSTATED: true,
  DATA_EXPORTED: true,
  PERMISSION_DENIED: true,
};

export const AUDIT_ACTIONS: readonly AuditAction[] = Object.keys(
  AUDIT_ACTION_MAP,
) as AuditAction[];

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
