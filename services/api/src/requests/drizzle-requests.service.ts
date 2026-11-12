import { Inject, Injectable } from "@nestjs/common";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, gte, lt, or } from "drizzle-orm";

import {
  CAPACITY_WINDOW_DAYS,
  IdentityError,
  REQUEST_FIELD_LIMITS,
  canCreateRequest,
  slotsInUse,
  type AffiliationLevel,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  affiliations,
  mentorProfiles,
  mentorshipRequests,
  mentorships,
  studentProfiles,
  users,
} from "../db/schema/index.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";
import type {
  CreateRequestInput,
  DecideRequestInput,
  ListRequestsInput,
  RequestPage,
  RequestRecord,
  RequestsService,
  WithdrawRequestInput,
} from "./requests.service.js";

type Executor = Pick<Database, "select">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 50;
/** The mentor's decision window. One source: the sweeper and the reliability read both use it. */
export const REQUEST_TTL_MS = 48 * 60 * 60 * 1000;

const studentUser = alias(users, "student_user");
const mentorUser = alias(users, "mentor_user");

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

function uuidOf(value: string, field: string): string {
  if (!UUID.test(value)) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be a valid id`);
  }
  return value;
}

function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) {
    return null;
  }
  const [millis, id] = cursor.split("|");
  const at = Number(millis);
  if (!Number.isInteger(at) || !id || !UUID.test(id)) {
    throw new IdentityError("VALIDATION_ERROR", "cursor is not valid");
  }
  return { createdAt: new Date(at), id };
}

const recordColumns = {
  id: mentorshipRequests.id,
  status: mentorshipRequests.status,
  interactionType: mentorshipRequests.interactionType,
  timeframe: mentorshipRequests.timeframe,
  question: mentorshipRequests.question,
  contextSummary: mentorshipRequests.contextSummary,
  targetOutcome: mentorshipRequests.targetOutcome,
  applicationNote: mentorshipRequests.applicationNote,
  decisionNote: mentorshipRequests.decisionNote,
  studentProfileId: mentorshipRequests.studentProfileId,
  mentorProfileId: mentorshipRequests.mentorProfileId,
  createdAt: mentorshipRequests.createdAt,
  expiresAt: mentorshipRequests.expiresAt,
  decidedAt: mentorshipRequests.decidedAt,
  reminderSentAt: mentorshipRequests.reminderSentAt,
  studentName: studentUser.name,
  mentorName: mentorUser.name,
  mentorshipId: mentorships.id,
};

function recordOf(row: Record<string, unknown>): RequestRecord {
  return row as unknown as RequestRecord;
}

async function readRecord(executor: Executor, id: string): Promise<RequestRecord | null> {
  const [row] = await executor
    .select(recordColumns)
    .from(mentorshipRequests)
    .innerJoin(studentProfiles, eq(studentProfiles.id, mentorshipRequests.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorshipRequests.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .leftJoin(mentorships, eq(mentorships.requestId, mentorshipRequests.id))
    .where(eq(mentorshipRequests.id, id))
    .limit(1);
  return row ? recordOf(row) : null;
}

function requireRecord(row: RequestRecord | null): RequestRecord {
  if (!row) {
    throw new IdentityError("SESSION_NOT_FOUND", "the request does not exist");
  }
  return row;
}

/** The participant view of the request plus the two account emails (never returned). */
async function readParticipants(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      id: mentorshipRequests.id,
      status: mentorshipRequests.status,
      studentUserId: studentProfiles.userId,
      mentorUserId: mentorProfiles.userId,
      studentEmail: studentUser.email,
      mentorEmail: mentorUser.email,
      mentorProfileId: mentorshipRequests.mentorProfileId,
      studentProfileId: mentorshipRequests.studentProfileId,
      fieldId: mentorshipRequests.fieldId,
    })
    .from(mentorshipRequests)
    .innerJoin(studentProfiles, eq(studentProfiles.id, mentorshipRequests.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorshipRequests.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(mentorshipRequests.id, id))
    .limit(1);
  return row ?? null;
}

@Injectable()
export class DrizzleRequestsService implements RequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: CreateRequestInput): Promise<RequestRecord> {
    const mentorProfileId = uuidOf(input.mentorProfileId, "mentor_id");
    const question = requiredText(input.question, "question", REQUEST_FIELD_LIMITS.question);
    const contextSummary = requiredText(
      input.contextSummary,
      "context_summary",
      REQUEST_FIELD_LIMITS.contextSummary,
    );
    const targetOutcome = requiredText(
      input.targetOutcome,
      "target_outcome",
      REQUEST_FIELD_LIMITS.targetOutcome,
    );
    const applicationNote = optionalText(
      input.applicationNote,
      "application_note",
      REQUEST_FIELD_LIMITS.applicationNote,
    );
    const interactionType = input.interactionType ?? "ASYNC_THREAD";

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);

    return await this.db.transaction(async (tx) => {
      const [student] = await tx
        .select({ id: studentProfiles.id })
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, input.userId))
        .limit(1);

      // The row lock serializes two submissions against one free slot (D2).
      const [mentor] = await tx
        .select({
          id: mentorProfiles.id,
          userId: mentorProfiles.userId,
          primaryFieldId: mentorProfiles.primaryFieldId,
          status: mentorProfiles.status,
          accessMode: mentorProfiles.accessMode,
          weeklyCapacity: mentorProfiles.weeklyCapacity,
          email: mentorUser.email,
        })
        .from(mentorProfiles)
        .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
        .where(eq(mentorProfiles.id, mentorProfileId))
        .for("update", { of: mentorProfiles })
        .limit(1);
      if (!mentor) {
        throw new IdentityError("VALIDATION_ERROR", "mentor_id does not name a mentor profile");
      }

      const [verified] = await tx
        .select({ level: affiliations.level })
        .from(affiliations)
        .where(and(eq(affiliations.userId, mentor.userId), eq(affiliations.status, "VERIFIED")))
        .limit(1);

      const [pair] = student
        ? await tx
            .select({ id: mentorshipRequests.id })
            .from(mentorshipRequests)
            .where(
              and(
                eq(mentorshipRequests.studentProfileId, student.id),
                eq(mentorshipRequests.mentorProfileId, mentor.id),
                eq(mentorshipRequests.status, "PENDING"),
              ),
            )
            .limit(1)
        : [undefined];

      const [studentPending] = student
        ? await tx
            .select({ value: count() })
            .from(mentorshipRequests)
            .where(
              and(
                eq(mentorshipRequests.studentProfileId, student.id),
                eq(mentorshipRequests.status, "PENDING"),
              ),
            )
        : [{ value: 0 }];

      const [mentorPending] = await tx
        .select({ value: count() })
        .from(mentorshipRequests)
        .where(
          and(
            eq(mentorshipRequests.mentorProfileId, mentor.id),
            eq(mentorshipRequests.status, "PENDING"),
          ),
        );

      const [acceptedInWindow] = await tx
        .select({ value: count() })
        .from(mentorshipRequests)
        .where(
          and(
            eq(mentorshipRequests.mentorProfileId, mentor.id),
            eq(mentorshipRequests.status, "ACCEPTED"),
            gte(
              mentorshipRequests.decidedAt,
              new Date(now.getTime() - CAPACITY_WINDOW_DAYS * 24 * 60 * 60 * 1000),
            ),
          ),
        );

      const decision = canCreateRequest({
        mentor: {
          userId: mentor.userId,
          status: mentor.status,
          accessMode: mentor.accessMode,
          level: (verified?.level ?? null) as AffiliationLevel | null,
        },
        callerUserId: input.userId,
        hasStudentProfile: Boolean(student),
        slotsInUse: slotsInUse({
          pending: Number(mentorPending?.value ?? 0),
          acceptedInWindow: Number(acceptedInWindow?.value ?? 0),
        }),
        weeklyCapacity: mentor.weeklyCapacity,
        pendingForPair: Boolean(pair),
        pendingForStudent: Number(studentPending?.value ?? 0),
        applicationNote,
        interactionType,
      });
      if (!decision.ok) {
        throw new IdentityError(decision.code, decision.message);
      }
      if (!student) {
        // Unreachable after the predicate; keeps the type honest.
        throw new IdentityError("VALIDATION_ERROR", "save a student profile first");
      }

      const [inserted] = await tx
        .insert(mentorshipRequests)
        .values({
          studentProfileId: student.id,
          mentorProfileId: mentor.id,
          fieldId: mentor.primaryFieldId,
          question,
          contextSummary,
          targetOutcome,
          timeframe: input.timeframe,
          interactionType,
          applicationNote,
          expiresAt,
          status: "PENDING",
        })
        .onConflictDoNothing()
        .returning({ id: mentorshipRequests.id });
      if (!inserted) {
        throw new IdentityError(
          "DUPLICATE_PENDING_REQUEST",
          "you already have a pending request with this mentor",
        );
      }

      await enqueueOutboxEvent(tx, {
        aggregateType: "MENTORSHIP_REQUEST",
        aggregateId: inserted.id,
        eventType: "EmailRequested",
        dedupeKey: `email:request-received:${inserted.id}`,
        payload: {
          to: mentor.email,
          template: "request-received",
          subject: "New mentorship request",
          text: [
            "A student sent you a mentorship request on connect.",
            "",
            `Question: ${question}`,
            "",
            `Review it within 48 hours: ${appOrigin()}/requests`,
          ].join("\n"),
        },
      });

      return requireRecord(await readRecord(tx, inserted.id));
    });
  }

  async list({ userId, role, status, cursor, limit }: ListRequestsInput): Promise<RequestPage> {
    const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const parsed = parseCursor(cursor);
    const ownerColumn =
      role === "sent" ? studentProfiles.userId : mentorProfiles.userId;

    const filters = [eq(ownerColumn, userId)];
    if (status) {
      filters.push(eq(mentorshipRequests.status, status));
    }
    if (parsed) {
      filters.push(
        or(
          lt(mentorshipRequests.createdAt, parsed.createdAt),
          and(
            eq(mentorshipRequests.createdAt, parsed.createdAt),
            lt(mentorshipRequests.id, parsed.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select(recordColumns)
      .from(mentorshipRequests)
      .innerJoin(studentProfiles, eq(studentProfiles.id, mentorshipRequests.studentProfileId))
      .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorshipRequests.mentorProfileId))
      .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
      .leftJoin(mentorships, eq(mentorships.requestId, mentorshipRequests.id))
      .where(and(...filters))
      .orderBy(desc(mentorshipRequests.createdAt), desc(mentorshipRequests.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const last = page[page.length - 1];
    return {
      requests: page.map(recordOf),
      nextCursor: hasMore && last
        ? `${(last.createdAt as Date).getTime()}|${last.id as string}`
        : null,
    };
  }

  async read(userId: string, requestId: string): Promise<RequestRecord> {
    uuidOf(requestId, "request id");
    const participants = await readParticipants(this.db, requestId);
    if (!participants || (participants.studentUserId !== userId && participants.mentorUserId !== userId)) {
      throw new IdentityError("SESSION_NOT_FOUND", "the request does not exist");
    }
    return requireRecord(await readRecord(this.db, requestId));
  }

  async decide(input: DecideRequestInput): Promise<RequestRecord> {
    const now = new Date();
    const note = optionalText(input.note, "reason", REQUEST_FIELD_LIMITS.decisionNote);

    return await this.db.transaction(async (tx) => {
      const participants = await readParticipants(tx, input.requestId);
      if (!participants) {
        throw new IdentityError("SESSION_NOT_FOUND", "the request does not exist");
      }
      if (participants.mentorUserId !== input.userId) {
        throw new IdentityError("FORBIDDEN", "only the addressee can decide this request");
      }

      if (input.action === "accept") {
        // Accepting moves one pending slot to accepted, so the cap can only bite
        // when it was lowered after the request was sent.
        const [mentor] = await tx
          .select({ weeklyCapacity: mentorProfiles.weeklyCapacity })
          .from(mentorProfiles)
          .where(eq(mentorProfiles.id, participants.mentorProfileId))
          .for("update")
          .limit(1);
        const [pending] = await tx
          .select({ value: count() })
          .from(mentorshipRequests)
          .where(
            and(
              eq(mentorshipRequests.mentorProfileId, participants.mentorProfileId),
              eq(mentorshipRequests.status, "PENDING"),
            ),
          );
        const [accepted] = await tx
          .select({ value: count() })
          .from(mentorshipRequests)
          .where(
            and(
              eq(mentorshipRequests.mentorProfileId, participants.mentorProfileId),
              eq(mentorshipRequests.status, "ACCEPTED"),
              gte(
                mentorshipRequests.decidedAt,
                new Date(now.getTime() - CAPACITY_WINDOW_DAYS * 24 * 60 * 60 * 1000),
              ),
            ),
          );
        if (
          mentor &&
          slotsInUse({
            pending: Number(pending?.value ?? 0) - 1,
            acceptedInWindow: Number(accepted?.value ?? 0),
          }) >= mentor.weeklyCapacity
        ) {
          throw new IdentityError("MENTOR_AT_CAPACITY", "this mentor is at weekly capacity");
        }
      }

      const [updated] = await tx
        .update(mentorshipRequests)
        .set({
          status: input.action === "accept" ? "ACCEPTED" : "DECLINED",
          decidedAt: now,
          decisionNote: note,
          updatedAt: now,
        })
        .where(
          and(
            eq(mentorshipRequests.id, input.requestId),
            eq(mentorshipRequests.status, "PENDING"),
          ),
        )
        .returning({ id: mentorshipRequests.id });
      if (!updated) {
        throw new IdentityError("REQUEST_INVALID_STATE", "this request was already decided");
      }

      if (input.action === "accept") {
        // Accepting creates the mentorship in the same transaction, so an
        // ACCEPTED request always has one (design D1, closes DEBT-20).
        await tx.insert(mentorships).values({
          requestId: input.requestId,
          studentProfileId: participants.studentProfileId,
          mentorProfileId: participants.mentorProfileId,
          fieldId: participants.fieldId,
          status: "ACTIVE",
          startedAt: now,
        });
      }

      await enqueueOutboxEvent(tx, {
        aggregateType: "MENTORSHIP_REQUEST",
        aggregateId: input.requestId,
        eventType: "EmailRequested",
        dedupeKey: `email:request-decided:${input.requestId}`,
        payload: {
          to: participants.studentEmail,
          template: "request-decided",
          subject: `Your mentorship request was ${input.action === "accept" ? "accepted" : "declined"}`,
          text: [
            `Your mentorship request was ${input.action === "accept" ? "accepted" : "declined"}.`,
            ...(note ? ["", `Reason: ${note}`] : []),
            "",
            `Open it: ${appOrigin()}/requests`,
          ].join("\n"),
        },
      });

      return requireRecord(await readRecord(tx, input.requestId));
    });
  }

  async withdraw(input: WithdrawRequestInput): Promise<RequestRecord> {
    const now = new Date();
    return await this.db.transaction(async (tx) => {
      const participants = await readParticipants(tx, input.requestId);
      if (!participants) {
        throw new IdentityError("SESSION_NOT_FOUND", "the request does not exist");
      }
      if (participants.studentUserId !== input.userId) {
        throw new IdentityError("FORBIDDEN", "only the sender can withdraw this request");
      }

      const [updated] = await tx
        .update(mentorshipRequests)
        .set({ status: "WITHDRAWN", updatedAt: now })
        .where(
          and(
            eq(mentorshipRequests.id, input.requestId),
            eq(mentorshipRequests.status, "PENDING"),
          ),
        )
        .returning({ id: mentorshipRequests.id });
      if (!updated) {
        throw new IdentityError("REQUEST_INVALID_STATE", "this request can no longer be withdrawn");
      }
      return requireRecord(await readRecord(tx, input.requestId));
    });
  }
}
