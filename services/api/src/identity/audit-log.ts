import type { Database } from "../db/database.js";
import { auditLogs } from "../db/schema/index.js";

export type AuditAction =
  | "USER_REGISTERED"
  | "EMAIL_VERIFIED"
  | "SIGN_IN_SUCCEEDED"
  | "SIGN_IN_FAILED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "SIGNED_OUT"
  | "SIGNED_OUT_EVERYWHERE";

export interface AuditEntry {
  action: AuditAction;
  /** Failed attempts have no actor and name no object. */
  actorUserId?: string | null;
  actorRole?: string;
  objectType: string;
  objectId?: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer. Metadata must never hold a password, hash, token, or raw
 * email address; callers pass ids and outcome labels only.
 */
export async function appendAuditEntry(database: Database, entry: AuditEntry): Promise<void> {
  await database.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? "ANONYMOUS",
    objectType: entry.objectType,
    objectId: entry.objectId ?? null,
    requestId: entry.requestId,
    metadata: entry.metadata ?? {},
  });
}
