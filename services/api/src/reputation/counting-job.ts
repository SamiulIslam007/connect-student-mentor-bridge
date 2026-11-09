import { and, count, eq, lte, sql } from "drizzle-orm";

import {
  REPUTATION_CONTRIBUTION_MULTIPLIERS,
  REPUTATION_DIFFICULTY_WEIGHTS,
  REPUTATION_TIER_MULTIPLIERS,
} from "@connect/config";
import {
  earnsMentorReputation,
  pairFactor,
  pointsToNumeric,
  reputationPoints,
} from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  fieldImpactSnapshots,
  outcomeEvents,
  outcomes,
  reputationEvents,
} from "../db/schema/index.js";

/** Its own cron queue, next to `requests-sweeper` (design D2). */
export const REPUTATION_COUNT_QUEUE = "reputation-counter";
export const REPUTATION_COUNT_CRON = "*/10 * * * *";

/** Bounded per run; one bad row must not stall the batch (design D2). */
export const REPUTATION_COUNT_BATCH = 50;

export interface CountResult {
  counted: number;
  events: number;
}

function difficultyFor(outcomeType: string): number {
  return (
    REPUTATION_DIFFICULTY_WEIGHTS[
      outcomeType as keyof typeof REPUTATION_DIFFICULTY_WEIGHTS
    ] ?? 1
  );
}

function tierFor(evidenceTier: number): number {
  return (
    REPUTATION_TIER_MULTIPLIERS[
      Math.min(Math.max(evidenceTier, 0), 2) as keyof typeof REPUTATION_TIER_MULTIPLIERS
    ] ?? 1
  );
}

function contributionFor(level: string | null): number {
  if (!level) {
    return 1;
  }
  return (
    REPUTATION_CONTRIBUTION_MULTIPLIERS[
      level as keyof typeof REPUTATION_CONTRIBUTION_MULTIPLIERS
    ] ?? 1
  );
}

/**
 * The cooling-to-counting pass (data-model T7, design D1-D7). One `CONFIRMED`
 * outcome becomes `COUNTED` only after its cooling deadline; the ledger event and
 * the snapshot are written in the same transaction, and an ineligible outcome
 * (a declared conflict or a platform basis) counts with no reputation event.
 * Safe to run repeatedly: the status guard and the unique `outcome_id` both
 * refuse a second count.
 */
export async function countDueOutcomes(
  database: Database,
  now: Date = new Date(),
): Promise<CountResult> {
  const due = await database
    .select({ id: outcomes.id })
    .from(outcomes)
    .where(and(eq(outcomes.status, "CONFIRMED"), lte(outcomes.coolingEndsAt, now)))
    .limit(REPUTATION_COUNT_BATCH);

  let counted = 0;
  let events = 0;

  for (const candidate of due) {
    // One transaction per outcome, so one failure cannot roll back the batch.
    const written = await database.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          id: outcomes.id,
          status: outcomes.status,
          countedBasis: outcomes.countedBasis,
          coiDeclared: outcomes.coiDeclared,
          coolingEndsAt: outcomes.coolingEndsAt,
          mentorProfileId: outcomes.mentorProfileId,
          studentProfileId: outcomes.studentProfileId,
          fieldId: outcomes.fieldId,
          outcomeType: outcomes.outcomeType,
          evidenceTier: outcomes.evidenceTier,
          contributionClaimed: outcomes.contributionClaimed,
          contributionConfirmed: outcomes.contributionConfirmed,
        })
        .from(outcomes)
        .where(eq(outcomes.id, candidate.id))
        .for("update")
        .limit(1);

      // Re-check under the lock: a dispute may have moved it out of CONFIRMED.
      if (
        !locked ||
        locked.status !== "CONFIRMED" ||
        locked.coolingEndsAt === null ||
        locked.coolingEndsAt.getTime() > now.getTime()
      ) {
        return false;
      }

      const basis = locked.coiDeclared ? "PLATFORM_DECISION" : "MENTOR_CONFIRMED";
      const updated = await tx
        .update(outcomes)
        .set({
          status: "COUNTED",
          countedAt: now,
          countedBasis: basis,
          updatedAt: now,
        })
        .where(and(eq(outcomes.id, locked.id), eq(outcomes.status, "CONFIRMED")))
        .returning({ id: outcomes.id });
      if (updated.length === 0) {
        return false;
      }

      const [seqRow] = await tx
        .select({ value: sql<number>`coalesce(max(${outcomeEvents.seq}), 0)` })
        .from(outcomeEvents)
        .where(eq(outcomeEvents.outcomeId, locked.id));
      await tx.insert(outcomeEvents).values({
        outcomeId: locked.id,
        seq: Number(seqRow?.value ?? 0) + 1,
        eventType: "COUNTED",
        fromStatus: "CONFIRMED",
        toStatus: "COUNTED",
        actorRole: "SYSTEM",
        requestId: "system:reputation-counter",
        payload: { counted_basis: basis },
      });

      if (
        !earnsMentorReputation({
          status: "COUNTED",
          countedBasis: basis,
          coiDeclared: locked.coiDeclared,
        })
      ) {
        return true;
      }

      const [earlier] = await tx
        .select({ value: count() })
        .from(reputationEvents)
        .where(
          and(
            eq(reputationEvents.mentorProfileId, locked.mentorProfileId),
            eq(reputationEvents.studentProfileId, locked.studentProfileId),
            // A reversal is a compensating row, not a second earned outcome.
            eq(reputationEvents.eventType, "COUNTED"),
          ),
        );
      const factor = pairFactor(Number(earlier?.value ?? 0));
      const factors = {
        difficultyWeight: difficultyFor(locked.outcomeType),
        tierMultiplier: tierFor(locked.evidenceTier),
        contributionMultiplier: contributionFor(
          locked.contributionConfirmed ?? locked.contributionClaimed,
        ),
        pairFactor: factor,
      };
      const points = pointsToNumeric(reputationPoints(factors));

      await tx.insert(reputationEvents).values({
        outcomeId: locked.id,
        mentorProfileId: locked.mentorProfileId,
        studentProfileId: locked.studentProfileId,
        fieldId: locked.fieldId,
        outcomeType: locked.outcomeType,
        eventType: "COUNTED",
        difficultyWeight: factors.difficultyWeight.toFixed(4),
        tierMultiplier: factors.tierMultiplier.toFixed(4),
        contributionMultiplier: factors.contributionMultiplier.toFixed(4),
        pairFactor: factor.toFixed(4),
        points,
        occurredAt: now,
      });

      // The upsert is additive, so a retried transaction neither increments twice
      // nor leaves the total behind the event.
      await tx
        .insert(fieldImpactSnapshots)
        .values({
          mentorProfileId: locked.mentorProfileId,
          fieldId: locked.fieldId,
          outcomeType: locked.outcomeType,
          countedCount: 1,
          pointsTotal: points,
        })
        .onConflictDoUpdate({
          target: [
            fieldImpactSnapshots.mentorProfileId,
            fieldImpactSnapshots.fieldId,
            fieldImpactSnapshots.outcomeType,
          ],
          set: {
            countedCount: sql`${fieldImpactSnapshots.countedCount} + 1`,
            pointsTotal: sql`${fieldImpactSnapshots.pointsTotal} + ${points}::numeric`,
            updatedAt: now,
          },
        });

      return true;
    });

    if (written) {
      counted += 1;
      events += 1;
    }
  }

  return { counted, events };
}
