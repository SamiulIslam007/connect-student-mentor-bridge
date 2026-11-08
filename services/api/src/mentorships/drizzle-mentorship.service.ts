import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  IdentityError,
  MENTORSHIP_FIELD_LIMITS,
  PLANNED_WEEKS,
  SESSION_DURATION_MINUTES,
  canAcknowledge,
  canComplete,
  isCadence,
  isHttpsUrl,
  nextSessionStatus,
  type Cadence,
  type MentorshipStatus,
  type SessionStatus,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  mentorProfiles,
  mentorshipRequests,
  mentorshipSessions,
  mentorships,
  studentProfiles,
  threadMessages,
} from "../db/schema/index.js";
import { users } from "../db/schema/index.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";
import type {
  AgreementInput,
  CreateSessionInput,
  ListMentorshipsInput,
  ListMessagesInput,
  MentorshipRecord,
  MentorshipService,
  MessagePage,
  MessageRecord,
  SessionInput,
  SessionRecord,
} from "./mentorship.service.js";

type Executor = Pick<Database, "select">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 50;

const studentUser = alias(users, "mentorship_student_user");
const mentorUser = alias(users, "mentorship_mentor_user");
const senderUser = alias(users, "thread_sender_user");

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

function pageSizeOf(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}

const recordColumns = {
  id: mentorships.id,
  requestId: mentorships.requestId,
  studentProfileId: mentorships.studentProfileId,
  mentorProfileId: mentorships.mentorProfileId,
  fieldId: mentorships.fieldId,
  status: mentorships.status,
  cadence: mentorships.cadence,
  plannedWeeks: mentorships.plannedWeeks,
  goal: mentorships.goal,
  studentAckAt: mentorships.studentAckAt,
  mentorAckAt: mentorships.mentorAckAt,
  isPaid: mentorships.isPaid,
  startedAt: mentorships.startedAt,
  endedAt: mentorships.endedAt,
  createdAt: mentorships.createdAt,
  question: mentorshipRequests.question,
  studentName: studentUser.name,
  mentorName: mentorUser.name,
};

function recordOf(row: Record<string, unknown>): MentorshipRecord {
  return row as unknown as MentorshipRecord;
}

function readRecord(executor: Executor, id: string, lock = false) {
  const query = executor
    .select(recordColumns)
    .from(mentorships)
    .innerJoin(mentorshipRequests, eq(mentorshipRequests.id, mentorships.requestId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(mentorships.id, id))
    .limit(1);
  return lock ? query.for("update", { of: mentorships }) : query;
}

function requireRecord(row: MentorshipRecord | null | undefined): MentorshipRecord {
  if (!row) {
    throw new IdentityError("SESSION_NOT_FOUND", "the mentorship does not exist");
  }
  return row;
}

/** The participants of one mentorship, with the two account emails (never returned). */
async function readParticipants(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      id: mentorships.id,
      status: mentorships.status,
      fieldId: mentorships.fieldId,
      requestId: mentorships.requestId,
      studentUserId: studentProfiles.userId,
      mentorUserId: mentorProfiles.userId,
      studentEmail: studentUser.email,
      mentorEmail: mentorUser.email,
      studentName: studentUser.name,
      mentorName: mentorUser.name,
    })
    .from(mentorships)
    .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(mentorships.id, id))
    .limit(1);
  return row ?? null;
}

/** A non-participant gets `404`, never `403`, so an id's existence is not confirmed (design D8). */
function requireParticipant<T extends { studentUserId: string; mentorUserId: string }>(
  participants: T | null,
  userId: string,
) {
  if (!participants || (participants.studentUserId !== userId && participants.mentorUserId !== userId)) {
    throw new IdentityError("SESSION_NOT_FOUND", "the mentorship does not exist");
  }
  return participants;
}

const sessionColumns = {
  id: mentorshipSessions.id,
  mentorshipId: mentorshipSessions.mentorshipId,
  createdByUserId: mentorshipSessions.createdByUserId,
  scheduledStart: mentorshipSessions.scheduledStart,
  durationMinutes: mentorshipSessions.durationMinutes,
  meetingUrl: mentorshipSessions.meetingUrl,
  status: mentorshipSessions.status,
  studentConfirmedHeldAt: mentorshipSessions.studentConfirmedHeldAt,
  mentorConfirmedHeldAt: mentorshipSessions.mentorConfirmedHeldAt,
  cancelledByUserId: mentorshipSessions.cancelledByUserId,
  cancelReason: mentorshipSessions.cancelReason,
  createdAt: mentorshipSessions.createdAt,
};

function sessionOf(row: Record<string, unknown> | undefined): SessionRecord {
  if (!row) {
    throw new IdentityError("SESSION_NOT_FOUND", "the session does not exist");
  }
  return row as unknown as SessionRecord;
}

function integerIn(value: unknown, field: string, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `${field} must be a whole number from ${min} to ${max}`,
    );
  }
  return parsed;
}

@Injectable()
export class DrizzleMentorshipService implements MentorshipService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list({ userId, status, limit }: ListMentorshipsInput): Promise<MentorshipRecord[]> {
    const filters = [or(eq(studentProfiles.userId, userId), eq(mentorProfiles.userId, userId))!];
    if (status) {
      filters.push(eq(mentorships.status, status));
    }
    const rows = await this.db
      .select(recordColumns)
      .from(mentorships)
      .innerJoin(mentorshipRequests, eq(mentorshipRequests.id, mentorships.requestId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, mentorships.studentProfileId))
      .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
      .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorships.mentorProfileId))
      .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
      .where(and(...filters))
      .orderBy(desc(mentorships.startedAt), desc(mentorships.id))
      .limit(pageSizeOf(limit));
    return rows.map(recordOf);
  }

  async read(userId: string, mentorshipId: string): Promise<MentorshipRecord> {
    uuidOf(mentorshipId, "mentorship id");
    requireParticipant(await readParticipants(this.db, mentorshipId), userId);
    return requireRecord((await readRecord(this.db, mentorshipId))[0]);
  }

  async setAgreement(input: AgreementInput): Promise<MentorshipRecord> {
    let cadence: Cadence | undefined;
    if (input.cadence !== undefined) {
      const upper = input.cadence.toUpperCase();
      if (!isCadence(upper)) {
        throw new IdentityError("VALIDATION_ERROR", "cadence is not a known cadence");
      }
      cadence = upper;
    }
    const plannedWeeks =
      input.plannedWeeks === undefined || input.plannedWeeks === null
        ? undefined
        : integerIn(input.plannedWeeks, "planned_weeks", PLANNED_WEEKS.min, PLANNED_WEEKS.max);
    const goal = input.goal?.trim() ?? "";
    if (goal.length > MENTORSHIP_FIELD_LIMITS.goal) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `goal must be at most ${MENTORSHIP_FIELD_LIMITS.goal} characters`,
      );
    }

    return await this.db.transaction(async (tx) => {
      const participants = requireParticipant(
        await readParticipants(tx, input.mentorshipId),
        input.userId,
      );
      if (!canAcknowledge(participants.status)) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this mentorship is not active");
      }
      await tx
        .update(mentorships)
        .set({
          ...(cadence ? { cadence } : {}),
          ...(plannedWeeks !== undefined ? { plannedWeeks } : {}),
          ...(goal ? { goal } : {}),
          updatedAt: new Date(),
        })
        .where(eq(mentorships.id, input.mentorshipId));
      return requireRecord((await readRecord(tx, input.mentorshipId))[0]);
    });
  }

  async acknowledge(userId: string, mentorshipId: string): Promise<MentorshipRecord> {
    return await this.db.transaction(async (tx) => {
      const participants = requireParticipant(await readParticipants(tx, mentorshipId), userId);
      if (!canAcknowledge(participants.status)) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this mentorship is not active");
      }
      const isStudent = participants.studentUserId === userId;
      await tx
        .update(mentorships)
        .set({
          // A later acknowledgement never overwrites the first timestamp.
          ...(isStudent
            ? { studentAckAt: sql`coalesce(${mentorships.studentAckAt}, now())` }
            : { mentorAckAt: sql`coalesce(${mentorships.mentorAckAt}, now())` }),
          updatedAt: new Date(),
        })
        .where(eq(mentorships.id, mentorshipId));
      return requireRecord((await readRecord(tx, mentorshipId))[0]);
    });
  }

  async listMessages({
    userId,
    mentorshipId,
    cursor,
    limit,
  }: ListMessagesInput): Promise<MessagePage> {
    const pageSize = pageSizeOf(limit);
    const participants = requireParticipant(await readParticipants(this.db, mentorshipId), userId);
    const parsed = parseCursor(cursor);

    // The cursor carries milliseconds, so both sides compare the truncated
    // timestamp; the id breaks a tie without ever repeating or skipping a row.
    const truncate = sql`date_trunc('milliseconds', ${threadMessages.createdAt})`;
    const filters = [eq(threadMessages.mentorshipId, participants.id)];
    if (parsed) {
      filters.push(
        or(gt(truncate, parsed.createdAt), and(eq(truncate, parsed.createdAt), gt(threadMessages.id, parsed.id)))!,
      );
    }

    const rows = await this.db
      .select({
        id: threadMessages.id,
        senderUserId: threadMessages.senderUserId,
        senderName: senderUser.name,
        body: threadMessages.body,
        createdAt: threadMessages.createdAt,
      })
      .from(threadMessages)
      .innerJoin(senderUser, eq(senderUser.id, threadMessages.senderUserId))
      .where(and(...filters))
      .orderBy(truncate, asc(threadMessages.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const last = page[page.length - 1];
    return {
      messages: page as MessageRecord[],
      nextCursor: hasMore && last ? `${last.createdAt.getTime()}|${last.id}` : null,
    };
  }

  async postMessage(userId: string, mentorshipId: string, body: string): Promise<MessageRecord> {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new IdentityError("VALIDATION_ERROR", "body is required");
    }
    if (trimmed.length > MENTORSHIP_FIELD_LIMITS.message) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `body must be at most ${MENTORSHIP_FIELD_LIMITS.message} characters`,
      );
    }

    return await this.db.transaction(async (tx) => {
      const participants = requireParticipant(await readParticipants(tx, mentorshipId), userId);
      const [inserted] = await tx
        .insert(threadMessages)
        .values({ mentorshipId: participants.id, senderUserId: userId, body: trimmed })
        .returning({ id: threadMessages.id });
      if (!inserted) {
        throw new Error("the message insert returned no row");
      }

      const isStudent = participants.studentUserId === userId;
      await enqueueOutboxEvent(tx, {
        aggregateType: "MENTORSHIP",
        aggregateId: participants.id,
        eventType: "EmailRequested",
        dedupeKey: `email:thread-message:${inserted.id}`,
        payload: {
          to: isStudent ? participants.mentorEmail : participants.studentEmail,
          template: "thread-message",
          subject: "New message on your mentorship",
          // The email names the sender and links to the thread; it never carries
          // another message's text.
          text: [
            `${isStudent ? "Your student" : "Your mentor"} sent you a message on connect.`,
            "",
            `Read it: ${appOrigin()}/mentorship/${participants.id}`,
          ].join("\n"),
        },
      });

      const [row] = await tx
        .select({
          id: threadMessages.id,
          senderUserId: threadMessages.senderUserId,
          senderName: senderUser.name,
          body: threadMessages.body,
          createdAt: threadMessages.createdAt,
        })
        .from(threadMessages)
        .innerJoin(senderUser, eq(senderUser.id, threadMessages.senderUserId))
        .where(eq(threadMessages.id, inserted.id))
        .limit(1);
      if (!row) {
        throw new Error("the inserted message could not be read back");
      }
      return row as MessageRecord;
    });
  }

  async listSessions(userId: string, mentorshipId: string): Promise<SessionRecord[]> {
    const participants = requireParticipant(await readParticipants(this.db, mentorshipId), userId);
    const rows = await this.db
      .select(sessionColumns)
      .from(mentorshipSessions)
      .where(eq(mentorshipSessions.mentorshipId, participants.id))
      .orderBy(asc(mentorshipSessions.scheduledStart), asc(mentorshipSessions.id));
    return rows as SessionRecord[];
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const meetingUrl = input.meetingUrl?.trim() ?? "";
    if (!isHttpsUrl(meetingUrl)) {
      throw new IdentityError("VALIDATION_ERROR", "meeting_url must begin with https://");
    }
    const durationMinutes = integerIn(
      input.durationMinutes,
      "duration_minutes",
      SESSION_DURATION_MINUTES.min,
      SESSION_DURATION_MINUTES.max,
    );
    const scheduledStart = new Date(input.scheduledStart ?? "");
    if (Number.isNaN(scheduledStart.getTime())) {
      throw new IdentityError("VALIDATION_ERROR", "scheduled_start must be a valid timestamp");
    }

    return await this.db.transaction(async (tx) => {
      const participants = requireParticipant(
        await readParticipants(tx, input.mentorshipId),
        input.userId,
      );
      const [inserted] = await tx
        .insert(mentorshipSessions)
        .values({
          mentorshipId: participants.id,
          createdByUserId: input.userId,
          scheduledStart,
          durationMinutes,
          meetingUrl,
          status: "SCHEDULED",
        })
        .returning({ id: mentorshipSessions.id });
      const [row] = inserted
        ? await tx
            .select(sessionColumns)
            .from(mentorshipSessions)
            .where(eq(mentorshipSessions.id, inserted.id))
            .limit(1)
        : [];
      return sessionOf(row);
    });
  }

  async confirmHeld(userId: string, sessionId: string): Promise<SessionRecord> {
    return await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ mentorshipId: mentorshipSessions.mentorshipId })
        .from(mentorshipSessions)
        .where(eq(mentorshipSessions.id, sessionId))
        .for("update")
        .limit(1);
      if (!locked) {
        throw new IdentityError("SESSION_NOT_FOUND", "the session does not exist");
      }
      const participants = requireParticipant(
        await readParticipants(tx, locked.mentorshipId),
        userId,
      );

      const [current] = await tx
        .select(sessionColumns)
        .from(mentorshipSessions)
        .where(eq(mentorshipSessions.id, sessionId))
        .limit(1);
      const session = sessionOf(current);
      const isStudent = participants.studentUserId === userId;
      const studentConfirmed = isStudent
        ? (session.studentConfirmedHeldAt ?? new Date())
        : session.studentConfirmedHeldAt;
      const mentorConfirmed = isStudent
        ? session.mentorConfirmedHeldAt
        : (session.mentorConfirmedHeldAt ?? new Date());

      const status = nextSessionStatus(session.status, {
        student: studentConfirmed !== null,
        mentor: mentorConfirmed !== null,
      });
      if (!status) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this session is already closed");
      }

      await tx
        .update(mentorshipSessions)
        .set({
          studentConfirmedHeldAt: studentConfirmed,
          mentorConfirmedHeldAt: mentorConfirmed,
          status,
          updatedAt: new Date(),
        })
        .where(eq(mentorshipSessions.id, sessionId));

      const [row] = await tx
        .select(sessionColumns)
        .from(mentorshipSessions)
        .where(eq(mentorshipSessions.id, sessionId))
        .limit(1);
      return sessionOf(row);
    });
  }

  async cancelSession({ userId, sessionId, reason }: SessionInput): Promise<SessionRecord> {
    const cancelReason = reason?.trim() ?? "";
    if (!cancelReason) {
      throw new IdentityError("VALIDATION_ERROR", "reason is required");
    }
    if (cancelReason.length > MENTORSHIP_FIELD_LIMITS.cancelReason) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `reason must be at most ${MENTORSHIP_FIELD_LIMITS.cancelReason} characters`,
      );
    }

    return await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ mentorshipId: mentorshipSessions.mentorshipId })
        .from(mentorshipSessions)
        .where(eq(mentorshipSessions.id, sessionId))
        .for("update")
        .limit(1);
      if (!locked) {
        throw new IdentityError("SESSION_NOT_FOUND", "the session does not exist");
      }
      requireParticipant(await readParticipants(tx, locked.mentorshipId), userId);

      const [row] = await tx
        .update(mentorshipSessions)
        .set({
          status: "CANCELLED" as SessionStatus,
          cancelledByUserId: userId,
          cancelReason,
          updatedAt: new Date(),
        })
        .where(
          and(eq(mentorshipSessions.id, sessionId), eq(mentorshipSessions.status, "SCHEDULED")),
        )
        .returning(sessionColumns);
      if (!row) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this session cannot be cancelled");
      }
      return row as SessionRecord;
    });
  }

  async complete(userId: string, mentorshipId: string): Promise<MentorshipRecord> {
    return await this.db.transaction(async (tx) => {
      const participants = requireParticipant(await readParticipants(tx, mentorshipId), userId);
      if (!canComplete(participants.status)) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this mentorship is not active");
      }
      const now = new Date();
      const updated = await tx
        .update(mentorships)
        .set({
          status: "COMPLETED" as MentorshipStatus,
          endedAt: now,
          endedByUserId: userId,
          updatedAt: now,
        })
        .where(and(eq(mentorships.id, mentorshipId), eq(mentorships.status, "ACTIVE")))
        .returning({ id: mentorships.id });
      if (updated.length === 0) {
        throw new IdentityError("MENTORSHIP_INVALID_STATE", "this mentorship is not active");
      }
      return requireRecord((await readRecord(tx, mentorshipId))[0]);
    });
  }
}

/** Counted only for the resume capacity check (design D7); request capacity is D-59. */
export async function liveMentorshipCount(
  executor: Pick<Database, "select">,
  mentorProfileId: string,
): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(mentorships)
    .where(
      and(eq(mentorships.mentorProfileId, mentorProfileId), eq(mentorships.status, "ACTIVE")),
    );
  return Number(row?.value ?? 0);
}
