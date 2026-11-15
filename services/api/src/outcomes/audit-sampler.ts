import { and, asc, eq, gt } from "drizzle-orm";

import { auditSampleRate } from "@connect/config";
import { IdentityError, shouldSample } from "@connect/domain";

import type { Database } from "../db/database.js";
import { outcomes } from "../db/schema/index.js";
import { DrizzleOutcomeService } from "./drizzle-outcome.service.js";
import type { OutcomeService } from "./outcome.service.js";

/** Its own cron queue, next to `reputation-counter` (design R3). */
export const AUDIT_SAMPLE_QUEUE = "audit-sampler";
export const AUDIT_SAMPLE_CRON = "*/15 * * * *";

/** Bounded per run; a backlog grows the review queue, not the job's runtime. */
export const AUDIT_SAMPLE_BATCH = 50;

export const AUDIT_SAMPLE_REQUEST_ID = "system:audit-sampler";

/** Stored in the existing `CASE_OPENED` payload, so a reviewer sees the cause. */
export const AUDIT_SAMPLE_REASONS = { SAMPLED: "AUDIT_SAMPLE", ALWAYS: "HIGH_DIFFICULTY" } as const;

export interface AuditSampleResult {
  selected: number;
  held: number;
  raced: number;
}

type Holder = Pick<OutcomeService, "hold">;

/**
 * The audit sampler (`FR-ADM-03`, design R3): select `CONFIRMED` outcomes whose
 * cooling period has not ended, hold the selected ones through the existing
 * audit-hold action, write nothing else. Safe to run every fifteen minutes: the
 * draw is stable per outcome id and the hold is conditional on the status it
 * read, so a second run over the same rows writes nothing.
 *
 * It never touches a counted or cooled outcome, so it cannot pull reputation
 * back; a raced decision is caught and the batch continues (design R4).
 */
export async function sampleConfirmedOutcomes(
  database: Database,
  options: { now?: Date; service?: Holder } = {},
): Promise<AuditSampleResult> {
  const now = options.now ?? new Date();
  const service = options.service ?? new DrizzleOutcomeService(database);
  const rate = auditSampleRate();

  const candidates = await database
    .select({ id: outcomes.id, outcomeType: outcomes.outcomeType })
    .from(outcomes)
    .where(and(eq(outcomes.status, "CONFIRMED"), gt(outcomes.coolingEndsAt, now)))
    .orderBy(asc(outcomes.coolingEndsAt), asc(outcomes.id))
    .limit(AUDIT_SAMPLE_BATCH);

  let selected = 0;
  let held = 0;
  let raced = 0;

  for (const candidate of candidates) {
    const draw = shouldSample({
      outcomeId: candidate.id,
      outcomeType: candidate.outcomeType,
      rate,
    });
    if (draw === "SKIPPED") {
      continue;
    }
    selected += 1;
    try {
      await service.hold({
        outcomeId: candidate.id,
        actorUserId: null,
        actorRole: "SYSTEM",
        reason: AUDIT_SAMPLE_REASONS[draw],
        requestId: AUDIT_SAMPLE_REQUEST_ID,
      });
      held += 1;
    } catch (error) {
      // Another actor decided or counted it between the select and the hold.
      if (error instanceof IdentityError && error.code === "OUTCOME_INVALID_STATE") {
        raced += 1;
        continue;
      }
      throw error;
    }
  }

  return { selected, held, raced };
}
