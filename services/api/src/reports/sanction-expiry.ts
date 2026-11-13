import { and, eq, isNotNull, lte } from "drizzle-orm";

import type { Database } from "../db/database.js";
import { users } from "../db/schema/index.js";
import { DrizzleReportsService } from "./drizzle-reports.service.js";

/**
 * The scheduled lift (design R5): its own queue every fifteen minutes, bounded
 * per run, each row lifted in its own transaction so one failure cannot stall
 * the batch or the next run (D-140).
 */
export const ACCOUNT_SANCTION_QUEUE = "account-sanction";
export const ACCOUNT_SANCTION_CRON = "*/15 * * * *";
export const SANCTION_BATCH_LIMIT = 50;

export interface SanctionSweepResult {
  lifted: number;
  failed: number;
}

/**
 * Lifts every suspension whose stored end date is at or before `now`. An account
 * with no end date is never selected, so an indefinite suspension stays until an
 * admin lifts it (D-141). A second run over the same rows lifts nothing.
 */
export async function liftExpiredSuspensions(
  database: Database,
  now: Date = new Date(),
): Promise<SanctionSweepResult> {
  const due = await database
    .select({ id: users.id, suspendedUntil: users.suspendedUntil })
    .from(users)
    .where(
      and(
        eq(users.status, "SUSPENDED"),
        isNotNull(users.suspendedUntil),
        lte(users.suspendedUntil, now),
      ),
    )
    .orderBy(users.suspendedUntil)
    .limit(SANCTION_BATCH_LIMIT);

  const reports = new DrizzleReportsService(database);
  let lifted = 0;
  let failed = 0;

  for (const row of due) {
    const endDate = row.suspendedUntil;
    if (endDate === null) {
      continue;
    }
    const instant = endDate.toISOString();
    try {
      const result = await reports.liftSuspension({
        accountId: row.id,
        actorUserId: null,
        reason: `The suspension ended on ${instant.slice(0, 10)} (scheduled lift).`,
        requestId: `sanction-expiry:${row.id}:${instant}`,
        source: "job",
        asOf: now,
      });
      if (result.lifted) {
        lifted += 1;
      }
    } catch (error) {
      // One bad row is logged and skipped; the batch and the next run continue.
      failed += 1;
      console.error(
        JSON.stringify({
          event: "sanctions.lift_failed",
          account_id: row.id,
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
    }
  }

  return { lifted, failed };
}
