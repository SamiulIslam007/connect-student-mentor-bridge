import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  IdentityError,
  MENTOR_DECISION_DAYS,
  OUTCOME_FIELD_LIMITS,
  coolingEndsAt,
  isContributionLevel,
  isReviewDecision,
  reversalPoints,
  reviewTarget,
  transition,
  type OutcomeStatus,
  type ReviewDecision,
} from "@connect/domain";
import { OUTCOME_COOLING_PERIOD_DAYS } from "@connect/config";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  fieldImpactSnapshots,
  fields,
  mentorProfiles,
  mentorships,
  outcomeEvents,
  outcomes,
  reputationEvents,
  studentProfiles,
  users,
  verificationRecords,
} from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";
import type {
  ConfirmOutcomeInput,
  DisputeOutcomeInput,
  ListOutcomesInput,
  OutcomeDecision,
  OutcomeRecord,
  OutcomeService,
  ReportOutcomeInput,
  ReviewInput,
  ReviewQueueInput,
  ReviewQueuePage,
} from "./outcome.service.js";

type Executor = Pick<Database, "select">;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 50;
const OUTCOME_TYPES = ["ADMISSION", "INTERNSHIP", "JOB_OFFER", "SKILL_MILESTONE", "INTERVIEW"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const studentUser = alias(users, "outcome_student_user");
const mentorUser = alias(users, "outcome_mentor_user");

function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the local origin below.
    }
  }
  return "http://localhost:3000";
}

function uuidOf(value: string, field: string): string {
  if (!UUID.test(value)) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be a valid id`);
  }
  return value;
}

function requiredText(value: string | undefined, field: string, max: number): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is required`);
  }
  if (trimmed.length > max) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be at most ${max} characters`);
  }
  return trimmed;
}

function optionalText(value: string | undefined, field: string, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be at most ${max} characters`);
  }
  return trimmed;
}

function outcomeTypeOf(value: string | undefined): (typeof OUTCOME_TYPES)[number] {
  const upper = (value ?? "").toUpperCase();
  if (!(OUTCOME_TYPES as readonly string[]).includes(upper)) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `outcome_type must be one of ${OUTCOME_TYPES.join(", ")}`,
    );
  }
  return upper as (typeof OUTCOME_TYPES)[number];
}

function contributionOf(value: string | undefined, field: string): string {
  const upper = (value ?? "").toUpperCase();
  if (!isContributionLevel(upper)) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be a known contribution level`);
  }
  return upper;
}

function occurredOnOf(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new IdentityError("VALIDATION_ERROR", "occurred_on must be a date");
  }
  return parsed.toISOString().slice(0, 10);
}

const recordColumns = {
  id: outcomes.id,
  mentorshipId: outcomes.mentorshipId,
  status: outcomes.status,
  outcomeType: outcomes.outcomeType,
  title: outcomes.title,
  description: outcomes.description,
  occurredOn: outcomes.occurredOn,
  contributionClaimed: outcomes.contributionClaimed,
  contributionConfirmed: outcomes.contributionConfirmed,
  evidenceTier: outcomes.evidenceTier,
  countedBasis: outcomes.countedBasis,
  coiDeclared: outcomes.coiDeclared,
  isPaidRelationship: outcomes.isPaidRelationship,
  mentorDecisionDueAt: outcomes.mentorDecisionDueAt,
  confirmedAt: outcomes.confirmedAt,
  coolingEndsAt: outcomes.coolingEndsAt,
  countedAt: outcomes.countedAt,
  withdrawnAt: outcomes.withdrawnAt,
  createdAt: outcomes.createdAt,
  studentProfileId: outcomes.studentProfileId,
  mentorProfileId: outcomes.mentorProfileId,
  fieldId: outcomes.fieldId,
  studentName: studentUser.name,
  mentorName: mentorUser.name,
};

function outcomeRecordOf(row: Record<string, unknown> | undefined): OutcomeRecord {
  if (!row) {
    throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
  }
  return row as unknown as OutcomeRecord;
}

function recordQuery(executor: Executor, id: string, lock = false) {
  const query = executor
    .select(recordColumns)
    .from(outcomes)
    .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(outcomes.id, id))
    .limit(1);
  return lock ? query.for("update", { of: outcomes }) : query;
}

async function readRecord(executor: Executor, id: string, lock = false): Promise<OutcomeRecord> {
  const [row] = await recordQuery(executor, id, lock);
  return outcomeRecordOf(row);
}

/** The outcome's participants and the two account emails (never returned). */
async function readOutcomeParticipants(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      id: outcomes.id,
      status: outcomes.status,
      mentorshipId: outcomes.mentorshipId,
      studentUserId: studentProfiles.userId,
      mentorUserId: mentorProfiles.userId,
      studentEmail: studentUser.email,
      mentorEmail: mentorUser.email,
    })
    .from(outcomes)
    .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(outcomes.id, id))
    .limit(1);
  return row ?? null;
}

async function readMentorshipParticipants(executor: Executor, mentorshipId: string) {
  const [row] = await executor
    .select({
      id: mentorships.id,
      fieldId: mentorships.fieldId,
      isPaid: mentorships.isPaid,
      studentProfileId: mentorships.studentProfileId,
      mentorProfileId: mentorships.mentorProfileId,
      studentUserId: studentProfiles.userId,
      mentorUserId: mentorProfiles.userId,
      studentEmail: studentUser.email,
      mentorEmail: mentorUser.email,
    })
    .from(mentorships)
    .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);
  return row ?? null;
}

function requireParticipant<T extends { studentUserId: string; mentorUserId: string }>(
  participants: T | null,
  userId: string,
): T {
  if (!participants || (participants.studentUserId !== userId && participants.mentorUserId !== userId)) {
    throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
  }
  return participants;
}

/** The participant-visible reviewer decisions, oldest first (design D7). */
async function decisionsFor(executor: Executor, outcomeId: string): Promise<OutcomeDecision[]> {
  const rows = await executor
    .select({
      decision: verificationRecords.decision,
      statement: verificationRecords.statement,
      createdAt: verificationRecords.createdAt,
    })
    .from(verificationRecords)
    .where(
      and(
        eq(verificationRecords.outcomeId, outcomeId),
        eq(verificationRecords.kind, "PLATFORM_DECISION"),
      ),
    )
    .orderBy(verificationRecords.createdAt);
  return rows.map((row) => ({
    decision: row.decision.toLowerCase(),
    reason: row.statement ?? "",
    decidedAt: row.createdAt,
  }));
}

/** One append-only event per transition, with a gap-free per-outcome `seq`. */
async function appendEvent(
  tx: Transaction,
  entry: {
    outcomeId: string;
    eventType: (typeof outcomeEvents.eventType.enumValues)[number];
    fromStatus: OutcomeStatus | null;
    toStatus: OutcomeStatus;
    actorUserId: string | null;
    actorRole: string;
    requestId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const [row] = await tx
    .select({ value: sql<number>`coalesce(max(${outcomeEvents.seq}), 0)` })
    .from(outcomeEvents)
    .where(eq(outcomeEvents.outcomeId, entry.outcomeId));
  await tx.insert(outcomeEvents).values({
    outcomeId: entry.outcomeId,
    seq: Number(row?.value ?? 0) + 1,
    eventType: entry.eventType,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    requestId: entry.requestId,
    payload: entry.payload ?? {},
  });
}

@Injectable()
export class DrizzleOutcomeService implements OutcomeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(input: ReportOutcomeInput): Promise<OutcomeRecord> {
    const mentorshipId = uuidOf(input.mentorshipId, "mentorship_id");
    const outcomeType = outcomeTypeOf(input.outcomeType);
    const description = requiredText(
      input.description,
      "description",
      OUTCOME_FIELD_LIMITS.description,
    );
    const title = optionalText(input.title, "title", OUTCOME_FIELD_LIMITS.title);
    const contributionClaimed = contributionOf(input.contributionClaimed, "contribution_claimed");
    const occurredOn = occurredOnOf(input.occurredOn);

    return await this.db.transaction(async (tx) => {
      const participants = await readMentorshipParticipants(tx, mentorshipId);
      if (!participants) {
        throw new IdentityError("SESSION_NOT_FOUND", "the mentorship does not exist");
      }
      // Only the mentorship's student reports (spec: only the student reports).
      if (participants.studentUserId !== input.userId) {
        throw new IdentityError("SESSION_NOT_FOUND", "the mentorship does not exist");
      }

      const now = new Date();
      const dueAt = new Date(now.getTime() + MENTOR_DECISION_DAYS * DAY_MS);
      const [inserted] = await tx
        .insert(outcomes)
        .values({
          mentorshipId: participants.id,
          studentProfileId: participants.studentProfileId,
          mentorProfileId: participants.mentorProfileId,
          fieldId: participants.fieldId,
          outcomeType,
          title,
          description,
          occurredOn,
          contributionClaimed: contributionClaimed as OutcomeRecord["contributionClaimed"],
          status: "PENDING_CONFIRMATION",
          evidenceTier: 0,
          isPaidRelationship: participants.isPaid,
          mentorDecisionDueAt: dueAt,
        })
        .returning({ id: outcomes.id });
      if (!inserted) {
        throw new Error("the outcome insert returned no row");
      }

      await appendEvent(tx, {
        outcomeId: inserted.id,
        eventType: "REPORTED",
        fromStatus: null,
        toStatus: "PENDING_CONFIRMATION",
        actorUserId: input.userId,
        actorRole: "STUDENT",
        requestId: input.requestId,
      });
      await appendAuditEntry(tx, {
        action: "OUTCOME_REPORTED",
        actorUserId: input.userId,
        actorRole: "STUDENT",
        objectType: "outcomes",
        objectId: inserted.id,
        requestId: input.requestId,
      });
      await enqueueOutboxEvent(tx, {
        aggregateType: "OUTCOME",
        aggregateId: inserted.id,
        eventType: "EmailRequested",
        dedupeKey: `email:outcome-reported:${inserted.id}`,
        payload: {
          to: participants.mentorEmail,
          template: "outcome-reported",
          subject: "Your student reported an outcome",
          text: [
            "Your student reported an outcome for your mentorship.",
            "",
            `It needs your decision within ${MENTOR_DECISION_DAYS} days: ${appOrigin()}/mentorship/${participants.id}`,
          ].join("\n"),
        },
      });

      return await readRecord(tx, inserted.id);
    });
  }

  async list({ userId, mentorshipId, status, limit }: ListOutcomesInput): Promise<OutcomeRecord[]> {
    const filters = [
      sql`(${studentProfiles.userId} = ${userId} OR ${mentorProfiles.userId} = ${userId})`,
    ];
    if (mentorshipId) {
      filters.push(sql`${outcomes.mentorshipId} = ${uuidOf(mentorshipId, "mentorship_id")}`);
    }
    if (status) {
      filters.push(sql`${outcomes.status} = ${status}`);
    }
    const rows = await this.db
      .select(recordColumns)
      .from(outcomes)
      .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
      .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
      .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
      .where(and(...filters))
      .orderBy(desc(outcomes.createdAt), desc(outcomes.id))
      .limit(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE));
    return rows as OutcomeRecord[];
  }

  async read(userId: string, outcomeId: string): Promise<OutcomeRecord> {
    uuidOf(outcomeId, "outcome id");
    requireParticipant(await readOutcomeParticipants(this.db, outcomeId), userId);
    const record = await readRecord(this.db, outcomeId);
    return { ...record, decisions: await decisionsFor(this.db, outcomeId) };
  }

  async confirm(input: ConfirmOutcomeInput): Promise<OutcomeRecord> {
    const coiDeclaration =
      input.coiDeclaration && typeof input.coiDeclaration === "object"
        ? (input.coiDeclaration as Record<string, unknown>)
        : undefined;
    const declared = input.coiDeclaration !== undefined && input.coiDeclaration !== null;
    if (!declared && input.contributionLevel === undefined) {
      throw new IdentityError("VALIDATION_ERROR", "contribution_level_confirmed is required");
    }
    const contributionLevel = declared
      ? null
      : (contributionOf(input.contributionLevel, "contribution_level_confirmed") as string);

    return await this.db.transaction(async (tx) => {
      const current = await readRecord(tx, input.outcomeId, true);
      const participants = await readOutcomeParticipants(tx, input.outcomeId);
      // Only the mentorship's mentor confirms.
      if (!participants || participants.mentorUserId !== input.userId) {
        throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
      }

      const target = transition(current.status, declared ? "declareConflict" : "confirm");
      if (!target) {
        throw new IdentityError("OUTCOME_INVALID_STATE", "this outcome cannot be confirmed now");
      }

      const now = new Date();
      await tx
        .update(outcomes)
        .set({
          status: target,
          ...(declared
            ? { coiDeclared: true }
            : {
                contributionConfirmed:
                  contributionLevel as OutcomeRecord["contributionConfirmed"],
                confirmedAt: now,
                coolingEndsAt: coolingEndsAt(now, OUTCOME_COOLING_PERIOD_DAYS),
              }),
          updatedAt: now,
        })
        .where(eq(outcomes.id, input.outcomeId));

      await tx.insert(verificationRecords).values(
        declared
          ? {
              outcomeId: input.outcomeId,
              kind: "CONFLICT_OF_INTEREST",
              decision: "DECLARED",
              attesterUserId: input.userId,
              coiDeclaration: coiDeclaration ?? {},
              statement: "Mentor declared a conflict of interest",
            }
          : {
              outcomeId: input.outcomeId,
              kind: "MENTOR_CONFIRMATION",
              decision: "CONFIRMED",
              attesterUserId: input.userId,
              contributionLevel:
                contributionLevel as OutcomeRecord["contributionConfirmed"],
            },
      );

      await appendEvent(tx, {
        outcomeId: input.outcomeId,
        eventType: declared ? "COI_DECLARED" : "CONFIRMED",
        fromStatus: current.status,
        toStatus: target,
        actorUserId: input.userId,
        actorRole: "MENTOR",
        requestId: input.requestId,
        payload: declared ? { coi_declaration: coiDeclaration ?? {} } : {},
      });
      await appendAuditEntry(tx, {
        action: declared ? "OUTCOME_COI_DECLARED" : "OUTCOME_CONFIRMED",
        actorUserId: input.userId,
        actorRole: "MENTOR",
        objectType: "outcomes",
        objectId: input.outcomeId,
        requestId: input.requestId,
      });
      await enqueueOutboxEvent(tx, {
        aggregateType: "OUTCOME",
        aggregateId: input.outcomeId,
        eventType: "EmailRequested",
        dedupeKey: `email:outcome-${declared ? "coi" : "confirmed"}:${input.outcomeId}`,
        payload: {
          to: participants.studentEmail,
          template: declared ? "outcome-disputed" : "outcome-confirmed",
          subject: declared
            ? "Your outcome went to platform review"
            : "Your mentor confirmed the outcome",
          text: [
            declared
              ? "Your mentor declared a conflict of interest, so the outcome is in platform review."
              : "Your mentor confirmed the outcome. It is not counted until the cooling period ends.",
            "",
            `Open it: ${appOrigin()}/mentorship/${participants.mentorshipId}`,
          ].join("\n"),
        },
      });

      return await readRecord(tx, input.outcomeId);
    });
  }

  async dispute(input: DisputeOutcomeInput): Promise<OutcomeRecord> {
    const reason = requiredText(input.reason, "reason", OUTCOME_FIELD_LIMITS.reason);

    return await this.db.transaction(async (tx) => {
      const current = await readRecord(tx, input.outcomeId, true);
      const participants = await readOutcomeParticipants(tx, input.outcomeId);
      if (!participants || participants.mentorUserId !== input.userId) {
        throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
      }

      const target = transition(current.status, "dispute");
      if (!target) {
        throw new IdentityError("OUTCOME_INVALID_STATE", "this outcome cannot be disputed now");
      }

      const now = new Date();
      await tx
        .update(outcomes)
        .set({ status: target, updatedAt: now })
        .where(eq(outcomes.id, input.outcomeId));
      await tx.insert(verificationRecords).values({
        outcomeId: input.outcomeId,
        kind: "MENTOR_DISPUTE",
        decision: "DISPUTED",
        attesterUserId: input.userId,
        statement: reason,
      });
      await appendEvent(tx, {
        outcomeId: input.outcomeId,
        eventType: "DISPUTED",
        fromStatus: current.status,
        toStatus: target,
        actorUserId: input.userId,
        actorRole: "MENTOR",
        requestId: input.requestId,
        payload: { reason },
      });
      await appendAuditEntry(tx, {
        action: "OUTCOME_DISPUTED",
        actorUserId: input.userId,
        actorRole: "MENTOR",
        objectType: "outcomes",
        objectId: input.outcomeId,
        requestId: input.requestId,
      });
      await enqueueOutboxEvent(tx, {
        aggregateType: "OUTCOME",
        aggregateId: input.outcomeId,
        eventType: "EmailRequested",
        dedupeKey: `email:outcome-disputed:${input.outcomeId}`,
        payload: {
          to: participants.studentEmail,
          template: "outcome-disputed",
          subject: "Your mentor disputed the outcome",
          text: [
            "Your mentor disputed the outcome, so it is in platform review.",
            "",
            `Open it: ${appOrigin()}/mentorship/${participants.mentorshipId}`,
          ].join("\n"),
        },
      });

      return await readRecord(tx, input.outcomeId);
    });
  }

  async withdraw(userId: string, outcomeId: string, requestId: string): Promise<OutcomeRecord> {
    return await this.db.transaction(async (tx) => {
      const current = await readRecord(tx, outcomeId, true);
      const participants = await readOutcomeParticipants(tx, outcomeId);
      // Only the reporting student withdraws.
      if (!participants || participants.studentUserId !== userId) {
        throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
      }

      const target = transition(current.status, "withdraw");
      if (!target) {
        throw new IdentityError("OUTCOME_INVALID_STATE", "this outcome cannot be withdrawn now");
      }

      const now = new Date();
      await tx
        .update(outcomes)
        .set({ status: target, withdrawnAt: now, updatedAt: now })
        .where(eq(outcomes.id, outcomeId));
      await appendEvent(tx, {
        outcomeId,
        eventType: "WITHDRAWN",
        fromStatus: current.status,
        toStatus: target,
        actorUserId: userId,
        actorRole: "STUDENT",
        requestId,
      });
      await appendAuditEntry(tx, {
        action: "OUTCOME_WITHDRAWN",
        actorUserId: userId,
        actorRole: "STUDENT",
        objectType: "outcomes",
        objectId: outcomeId,
        requestId,
      });

      return await readRecord(tx, outcomeId);
    });
  }

  /**
   * The only exit from `IN_PLATFORM_REVIEW` (design D2/D5). `invalid` on a
   * COUNTED outcome is the T11 clawback: a compensating REVERSAL event and a
   * decremented snapshot in the same transaction. A valid decision counts with
   * `PLATFORM_DECISION`, so it never earns mentor reputation (D6).
   */
  async review(input: ReviewInput): Promise<OutcomeRecord> {
    if (!isReviewDecision(input.decision)) {
      throw new IdentityError("VALIDATION_ERROR", "decision must be valid or invalid");
    }
    const reason = requiredText(input.reason, "reason", OUTCOME_FIELD_LIMITS.reason);

    return await this.db.transaction(async (tx) => {
      const current = await readRecord(tx, input.outcomeId, true);
      const target = reviewTarget(current.status, input.decision as ReviewDecision);
      if (!target) {
        throw new IdentityError(
          "OUTCOME_INVALID_STATE",
          "this outcome cannot take that review decision now",
        );
      }

      const participants = await readOutcomeParticipants(tx, input.outcomeId);
      const now = new Date();
      await tx
        .update(outcomes)
        .set({
          status: target,
          updatedAt: now,
          ...(target === "COUNTED"
            ? { countedAt: now, countedBasis: "PLATFORM_DECISION" }
            : {}),
          ...(target === "REJECTED" ? { rejectedAt: now } : {}),
          ...(target === "REVERSED" ? { reversedAt: now } : {}),
        })
        .where(and(eq(outcomes.id, input.outcomeId), eq(outcomes.status, current.status)));

      await tx.insert(verificationRecords).values({
        outcomeId: input.outcomeId,
        kind: "PLATFORM_DECISION",
        decision: input.decision === "valid" ? "VALID" : "NOT_VALID",
        attesterUserId: input.userId,
        statement: reason,
      });

      await appendEvent(tx, {
        outcomeId: input.outcomeId,
        eventType: "CASE_RESOLVED",
        fromStatus: current.status,
        toStatus: target,
        actorUserId: input.userId,
        actorRole: "PLATFORM_ADMIN",
        requestId: input.requestId,
        payload: { decision: input.decision, reason },
      });
      await appendAuditEntry(tx, {
        action: target === "REVERSED" ? "OUTCOME_REVERSED" : "OUTCOME_REVIEWED",
        actorUserId: input.userId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "outcomes",
        objectId: input.outcomeId,
        requestId: input.requestId,
      });

      if (target === "REVERSED") {
        await this.reverseLedger(tx, input.outcomeId, now);
      }

      if (participants) {
        await enqueueOutboxEvent(tx, {
          aggregateType: "OUTCOME",
          aggregateId: input.outcomeId,
          eventType: "EmailRequested",
          dedupeKey: `email:outcome-review:${input.outcomeId}:${input.decision}`,
          payload: {
            to: participants.studentEmail,
            template: target === "REVERSED" ? "outcome-reversed" : "outcome-reviewed",
            subject:
              target === "REVERSED"
                ? "A counted outcome was reversed"
                : target === "COUNTED"
                  ? "A reviewer counted your outcome"
                  : "A reviewer did not count your outcome",
            text: [
              `Decision: ${input.decision}.`,
              `Reason: ${reason}`,
              "",
              `Open it: ${appOrigin()}/mentorship/${participants.mentorshipId}`,
            ].join("\n"),
          },
        });
      }

      return await readRecord(tx, input.outcomeId);
    });
  }

  /** One compensating event and a decremented snapshot; the original stays. */
  private async reverseLedger(tx: Transaction, outcomeId: string, now: Date): Promise<void> {
    const [counted] = await tx
      .select()
      .from(reputationEvents)
      .where(and(eq(reputationEvents.outcomeId, outcomeId), eq(reputationEvents.eventType, "COUNTED")))
      .limit(1);
    if (!counted) {
      return;
    }

    await tx.insert(reputationEvents).values({
      outcomeId,
      mentorProfileId: counted.mentorProfileId,
      studentProfileId: counted.studentProfileId,
      fieldId: counted.fieldId,
      outcomeType: counted.outcomeType,
      eventType: "REVERSAL",
      difficultyWeight: counted.difficultyWeight,
      tierMultiplier: counted.tierMultiplier,
      contributionMultiplier: counted.contributionMultiplier,
      pairFactor: counted.pairFactor,
      points: reversalPoints(Number(counted.points)).toFixed(6),
      occurredAt: now,
    });

    await tx
      .update(fieldImpactSnapshots)
      .set({
        countedCount: sql`${fieldImpactSnapshots.countedCount} - 1`,
        pointsTotal: sql`${fieldImpactSnapshots.pointsTotal} - ${counted.points}::numeric`,
        updatedAt: now,
      })
      .where(
        and(
          eq(fieldImpactSnapshots.mentorProfileId, counted.mentorProfileId),
          eq(fieldImpactSnapshots.fieldId, counted.fieldId),
          eq(fieldImpactSnapshots.outcomeType, counted.outcomeType),
        ),
      );
  }

  async reviewQueue({ limit, cursor }: ReviewQueueInput): Promise<ReviewQueuePage> {
    const conditions = [eq(outcomes.status, "IN_PLATFORM_REVIEW")];
    if (cursor) {
      conditions.push(sql`(
        ${outcomes.mentorDecisionDueAt}, ${outcomes.id}
      ) > (
        SELECT due.mentor_decision_due_at, due.id FROM outcomes due WHERE due.id = ${cursor}
      )`);
    }

    const rows = await this.db
      .select({
        id: outcomes.id,
        mentorshipId: outcomes.mentorshipId,
        outcomeType: outcomes.outcomeType,
        description: outcomes.description,
        countedBasis: outcomes.countedBasis,
        fieldName: fields.name,
        studentName: studentUser.name,
        mentorName: mentorUser.name,
        caseKind: sql<string>`COALESCE((
          SELECT record.kind::text FROM verification_records record
          WHERE record.outcome_id = ${outcomes.id}
            AND record.kind IN ('MENTOR_DISPUTE', 'CONFLICT_OF_INTEREST')
          ORDER BY record.created_at DESC LIMIT 1
        ), 'ESCALATED_D7')`,
        reason: sql<string | null>`(
          SELECT record.statement FROM verification_records record
          WHERE record.outcome_id = ${outcomes.id}
          ORDER BY record.created_at DESC LIMIT 1
        )`,
        openedAt: sql<Date>`COALESCE((
          SELECT event.occurred_at FROM outcome_events event
          WHERE event.outcome_id = ${outcomes.id}
            AND event.event_type IN ('CASE_OPENED', 'ESCALATED_D7', 'DISPUTED', 'COI_DECLARED')
          ORDER BY event.occurred_at DESC LIMIT 1
        ), ${outcomes.createdAt})`,
      })
      .from(outcomes)
      .innerJoin(fields, eq(fields.id, outcomes.fieldId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
      .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
      .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
      .where(and(...conditions))
      .orderBy(outcomes.mentorDecisionDueAt, outcomes.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const now = Date.now();
    return {
      cases: page.map((row) => ({
        id: row.id,
        mentorshipId: row.mentorshipId,
        outcomeType: row.outcomeType,
        description: row.description,
        fieldName: row.fieldName,
        studentName: row.studentName,
        mentorName: row.mentorName,
        caseKind: row.caseKind,
        reason: row.reason,
        openedAt: row.openedAt,
        waitingDays: Math.max(0, Math.floor((now - new Date(row.openedAt).getTime()) / 86_400_000)),
        countedBasis: row.countedBasis,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

}
