import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

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

type RowOutcome = "skip" | "eligible" | "deleted" | "failed";

/**
 * Deletes the object of every evidence file whose outcome settled longer ago than
 * the window, keeps the row and its SHA-256, and writes one audit entry per
 * deletion (FR-PRIV-03, design R4).
 *
 * Each file is handled in its own transaction that locks its evidence row and its
 * outcome, re-reads both, and only then deletes the object and marks the row: a
 * clawback that lands between the batch read and this point therefore keeps the
 * evidence it needs, and two overlapping runs cannot delete the same object twice.
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

  const candidates = await db
    .select({ id: outcomeEvidence.id })
    .from(outcomeEvidence)
    .innerJoin(outcomes, eq(outcomes.id, outcomeEvidence.outcomeId))
    .where(
      and(
        isNull(outcomeEvidence.deletedAt),
        // An intent whose bytes never landed has no file to delete.
        isNotNull(outcomeEvidence.uploadedAt),
        inArray(outcomes.status, ["COUNTED", "REJECTED"]),
      ),
    )
    .orderBy(asc(sql`coalesce(${outcomes.countedAt}, ${outcomes.rejectedAt})`))
    .limit(options.batch ?? 100);

  for (const candidate of candidates) {
    result.examined += 1;
    const outcome = await db.transaction(async (tx): Promise<RowOutcome> => {
      const [row] = await tx
        .select({
          id: outcomeEvidence.id,
          objectKey: outcomeEvidence.objectKey,
          outcomeId: outcomes.id,
          status: outcomes.status,
          countedAt: outcomes.countedAt,
          rejectedAt: outcomes.rejectedAt,
          deletedAt: outcomeEvidence.deletedAt,
          uploadedAt: outcomeEvidence.uploadedAt,
        })
        .from(outcomeEvidence)
        .innerJoin(outcomes, eq(outcomes.id, outcomeEvidence.outcomeId))
        .where(eq(outcomeEvidence.id, candidate.id))
        .limit(1)
        .for("update");
      if (!row || row.deletedAt || !row.uploadedAt) {
        return "skip";
      }
      const due = evidenceRetentionDue({
        outcomeStatus: row.status,
        countedAt: row.countedAt,
        rejectedAt: row.rejectedAt,
        now,
        windowDays: options.windowDays,
      });
      if (!due) {
        return "skip";
      }
      if (options.dryRun) {
        return "eligible";
      }

      try {
        await options.storage.delete(row.objectKey);
      } catch {
        // The row keeps `deleted_at` null, so the next run tries again.
        return "failed";
      }
      await tx
        .update(outcomeEvidence)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(outcomeEvidence.id, row.id), isNull(outcomeEvidence.deletedAt)));
      await appendAuditEntry(tx, {
        action: "EVIDENCE_RETENTION_DELETED",
        actorRole: "SYSTEM",
        objectType: "outcome_evidence",
        objectId: row.id,
        requestId: EVIDENCE_RETENTION_AUDIT_REQUEST_ID,
        metadata: { outcome_id: row.outcomeId },
      });
      return "deleted";
    });

    if (outcome === "eligible") {
      result.eligible += 1;
    } else if (outcome === "deleted") {
      result.eligible += 1;
      result.deleted += 1;
    } else if (outcome === "failed") {
      result.eligible += 1;
      result.failed += 1;
    }
  }

  return result;
}
