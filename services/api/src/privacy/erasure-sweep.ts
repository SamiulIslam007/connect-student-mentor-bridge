import { EVIDENCE_RETENTION_DAYS } from "@connect/config";

import { createDatabaseConnection } from "../db/database.js";
import { resolveDatabaseUrl } from "../db/database-url.js";
import { createEvidenceStorage } from "../evidence/storage.js";
import { sweepExpiredEvidence } from "../evidence/retention.js";

/**
 * The operator gate for the one irreversible sweep (D-259, design R4): a dry run
 * prints the candidate count, and a real run is allowed only with a confirmed
 * backup date. Kept pure so a test can prove the refusal without a database.
 */
export interface ErasureSweepPlan {
  dryRun: boolean;
  backupAt: string | null;
}

const BACKUP_FLAG = "--confirm-backup=";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseErasureSweepArgs(argv: readonly string[]): ErasureSweepPlan {
  const flag = argv.find((argument) => argument.startsWith(BACKUP_FLAG));
  if (!flag) {
    return { dryRun: true, backupAt: null };
  }
  const value = flag.slice(BACKUP_FLAG.length);
  if (!DATE_ONLY.test(value)) {
    throw new Error(`${BACKUP_FLAG} needs a YYYY-MM-DD date`);
  }
  return { dryRun: false, backupAt: value };
}

export function erasureSweepRecord(
  plan: ErasureSweepPlan,
  result: { eligible: number; deleted: number; failed: number },
): Record<string, unknown> {
  return {
    event: "privacy.erasure_sweep",
    dry_run: plan.dryRun,
    backup_at: plan.backupAt,
    candidates: result.eligible,
    deleted: result.deleted,
    failed: result.failed,
    window_days: EVIDENCE_RETENTION_DAYS,
  };
}

async function main(): Promise<void> {
  const plan = parseErasureSweepArgs(process.argv.slice(2));
  const storage = createEvidenceStorage();
  const connection = createDatabaseConnection(resolveDatabaseUrl());
  try {
    if (!plan.dryRun && !storage) {
      throw new Error("a real sweep needs an object store");
    }
    const result = await sweepExpiredEvidence(connection.db, {
      // A dry run never needs the object store; the sweep only reads rows.
      storage: storage ?? {
        put: async () => undefined,
        get: async () => Buffer.alloc(0),
        delete: async () => {
          throw new Error("dry run");
        },
        presignGet: async () => "",
      },
      dryRun: plan.dryRun,
      windowDays: EVIDENCE_RETENTION_DAYS,
    });
    console.log(JSON.stringify(erasureSweepRecord(plan, result)));
  } finally {
    await connection.pool.end();
  }
}

if (process.argv[1]?.includes("erasure-sweep")) {
  // No top-level await: this workspace transforms to CJS.
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "privacy.erasure_sweep_failed",
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
