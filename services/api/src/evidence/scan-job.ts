import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { Database } from "../db/database.js";
import { outcomeEvidence, outcomes } from "../db/schema/index.js";
import { scanBytes, type ScanResult } from "./scan.js";
import type { EvidenceStorage } from "./storage.js";

/** The scan runs on its own two-minute pass over quarantined rows (design R5). */
export const EVIDENCE_SCAN_QUEUE = "evidence-scan";
export const EVIDENCE_SCAN_CRON = "*/2 * * * *";
export const EVIDENCE_SCAN_BATCH = 10;

export interface ScanJobResult {
  examined: number;
  clean: number;
  rejected: number;
  failed: number;
}

export interface ScanJobOptions {
  storage: EvidenceStorage;
  /** The unit test's seam; the worker passes `scanBytes`. */
  scan?: (bytes: Buffer) => Promise<ScanResult>;
  batch?: number;
  now?: () => Date;
}

/**
 * Fetches each uploaded, quarantined object, scans it, and moves it to `CLEAN`
 * (raising the tier once) or `REJECTED`. A scanner error leaves the row where it
 * is so the next pass retries: fail closed, never a guess.
 */
export async function scanQuarantinedEvidence(
  db: Database,
  options: ScanJobOptions,
): Promise<ScanJobResult> {
  const scan = options.scan ?? ((bytes: Buffer) => scanBytes(bytes));
  const now = options.now ?? (() => new Date());
  const result: ScanJobResult = { examined: 0, clean: 0, rejected: 0, failed: 0 };

  const rows = await db
    .select({ id: outcomeEvidence.id, objectKey: outcomeEvidence.objectKey })
    .from(outcomeEvidence)
    .where(
      and(
        eq(outcomeEvidence.status, "QUARANTINED"),
        isNull(outcomeEvidence.deletedAt),
        // An intent with no bytes has nothing to scan.
        isNotNull(outcomeEvidence.uploadedAt),
      ),
    )
    .limit(options.batch ?? EVIDENCE_SCAN_BATCH);

  for (const row of rows) {
    result.examined += 1;
    let bytes: Buffer;
    try {
      bytes = await options.storage.get(row.objectKey);
    } catch (error) {
      result.failed += 1;
      await db
        .update(outcomeEvidence)
        .set({ scanDetail: `fetch failed: ${(error as Error).message}`, updatedAt: now() })
        // Only a still-quarantined row: another pass may have settled it meanwhile.
        .where(
          and(eq(outcomeEvidence.id, row.id), eq(outcomeEvidence.status, "QUARANTINED")),
        );
      continue;
    }

    const scanned = await scan(bytes);
    if ("error" in scanned) {
      result.failed += 1;
      await db
        .update(outcomeEvidence)
        .set({ scanDetail: `scan failed: ${scanned.error}`, updatedAt: now() })
        .where(
          and(eq(outcomeEvidence.id, row.id), eq(outcomeEvidence.status, "QUARANTINED")),
        );
      continue;
    }
    if (!scanned.clean) {
      await db
        .update(outcomeEvidence)
        .set({
          status: "REJECTED",
          scannedAt: now(),
          scanDetail: `detected ${scanned.signature}`,
          updatedAt: now(),
        })
        .where(eq(outcomeEvidence.id, row.id));
      result.rejected += 1;
      continue;
    }

    const settled = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(outcomeEvidence)
        .set({ status: "CLEAN", scannedAt: now(), scanDetail: null, updatedAt: now() })
        .where(
          and(eq(outcomeEvidence.id, row.id), eq(outcomeEvidence.status, "QUARANTINED")),
        )
        .returning({ outcomeId: outcomeEvidence.outcomeId });
      if (!updated) {
        // Another pass settled this row first; the tier is already right.
        return false;
      }
      // The `evidence_tier = 0` predicate makes a second clean scan a no-op.
      await tx
        .update(outcomes)
        .set({ evidenceTier: 1, updatedAt: now() })
        .where(and(eq(outcomes.id, updated.outcomeId), eq(outcomes.evidenceTier, 0)));
      return true;
    });
    if (settled) {
      result.clean += 1;
    }
  }

  return result;
}
