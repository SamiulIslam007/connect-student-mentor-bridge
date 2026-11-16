import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { evidenceRetentionDue } from "@connect/domain";

import type { Database } from "../db/database.js";
import { outcomeEvidence, outcomes } from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import type { EvidenceStorage } from "./storage.js";

export const EVIDENCE_RETENTION_AUDIT_REQUEST_ID = "system:evidence-retention";

export interface RetentionResult {
  examined: number;
  eligible: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
}

export interface RetentionOptions {
  storage: EvidenceStorage;
  /** The job's default comes from the environment; a test drives the real path. */
  dryRun: boolean;
  windowDays: number;
  batch?: number;
  now?: Date;
}

/**
 * Deletes the object of every evidence file whose outcome settled longer ago than
 * the window, keeps the row and its SHA-256, and writes one audit entry per
 * deletion (FR-PRIV-03, design R4). The object goes first: a row that claims a
 * deletion which did not happen would be an audit log that lies.
 */
export async function sweepExpiredEvidence(
  db: Database,
  options: RetentionOptions,
): Promise<RetentionResult> {
  const now = options.now ?? new Date();
  const result: RetentionResult = {
    examined: 0,
    eligible: 0,
    deleted: 0,
    failed: 0,
    dryRun: options.dryRun,
  };

  const rows = await db
    .select({
      id: outcomeEvidence.id,
      objectKey: outcomeEvidence.objectKey,
      outcomeId: outcomes.id,
      status: outcomes.status,
      countedAt: outcomes.countedAt,
      rejectedAt: outcomes.rejectedAt,
    })
    .from(outcomeEvidence)
    .innerJoin(outcomes, eq(outcomes.id, outcomeEvidence.outcomeId))
    .where(
      and(
        isNull(outcomeEvidence.deletedAt),
        inArray(outcomes.status, ["COUNTED", "REJECTED"]),
      ),
    )
    .orderBy(asc(sql`coalesce(${outcomes.countedAt}, ${outcomes.rejectedAt})`))
    .limit(options.batch ?? 100);

  for (const row of rows) {
    result.examined += 1;
    const due = evidenceRetentionDue({
      outcomeStatus: row.status,
      countedAt: row.countedAt,
      rejectedAt: row.rejectedAt,
      now,
      windowDays: options.windowDays,
    });
    if (!due) {
      continue;
    }
    result.eligible += 1;
    if (options.dryRun) {
      continue;
    }

    try {
      await options.storage.delete(row.objectKey);
    } catch {
      // The row stays eligible: nothing was marked and no audit row claims it.
      result.failed += 1;
      continue;
    }

    const deleted = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(outcomeEvidence)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(outcomeEvidence.id, row.id), isNull(outcomeEvidence.deletedAt)))
        .returning({ id: outcomeEvidence.id });
      if (!updated) {
        return false;
      }
      await appendAuditEntry(tx, {
        action: "EVIDENCE_RETENTION_DELETED",
        actorRole: "SYSTEM",
        objectType: "outcome_evidence",
        objectId: row.id,
        requestId: EVIDENCE_RETENTION_AUDIT_REQUEST_ID,
        metadata: { outcome_id: row.outcomeId },
      });
      return true;
    });
    if (deleted) {
      result.deleted += 1;
    }
  }

  return result;
}
