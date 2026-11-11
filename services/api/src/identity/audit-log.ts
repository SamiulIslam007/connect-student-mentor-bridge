import type { Database } from "../db/database.js";
import { auditLogs } from "../db/schema/index.js";

export type AuditAction =
  | "USER_REGISTERED"
  | "EMAIL_VERIFIED"
  | "ACCOUNT_ACTIVATED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_DEACTIVATED"
  | "SIGN_IN_SUCCEEDED"
  | "SIGN_IN_FAILED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "SIGNED_OUT"
  | "SIGNED_OUT_EVERYWHERE"
  | "MFA_ENROLLED"
  | "MFA_VERIFIED"
  | "MFA_VERIFICATION_FAILED"
  | "MFA_DISABLED"
  | "SESSION_REVOKED"
  | "ROLE_GRANTED"
  | "AFFILIATION_GRANTED"
  | "AFFILIATION_REJECTED"
  | "AFFILIATION_REVOKED"
  | "PROVIDER_SIGN_IN"
  | "OUTCOME_REPORTED"
  | "OUTCOME_CONFIRMED"
  | "OUTCOME_DISPUTED"
  | "OUTCOME_COI_DECLARED"
  | "OUTCOME_ESCALATED"
  | "OUTCOME_WITHDRAWN"
  | "OUTCOME_REVIEWED"
  | "OUTCOME_REVERSED"
  | "ACCOUNT_DELETED"
  | "REPORT_RESOLVED";

export interface AuditEntry {
  action: AuditAction;
  /** Failed attempts have no actor and name no object. */
  actorUserId?: string | null;
  actorRole?: string;
  objectType: string;
  objectId?: string | null;
  requestId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** Anything that can run an insert: the pooled database or a transaction. */
type AuditWriter = Pick<Database, "insert">;

/**
 * Append-only writer. Metadata must never hold a password, hash, token, or raw
 * email address; callers pass ids and outcome labels only.
 */
export async function appendAuditEntry(database: AuditWriter, entry: AuditEntry): Promise<void> {
  await database.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? "ANONYMOUS",
    objectType: entry.objectType,
    objectId: entry.objectId ?? null,
    requestId: entry.requestId,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? {},
  });
}
