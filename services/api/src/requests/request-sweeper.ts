import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "../db/database.js";
import { mentorProfiles, mentorshipRequests, studentProfiles, users } from "../db/schema/index.js";
import { appOrigin } from "../email/app-origin.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";

/** One sweeper queue, scheduled every five minutes (design D4, architecture §8.2). */
export const REQUEST_SWEEP_QUEUE = "requests-sweeper";
export const REQUEST_SWEEP_CRON = "*/5 * * * *";

const HOUR_MS = 60 * 60 * 1000;

const studentUser = alias(users, "sweep_student_user");
const mentorUser = alias(users, "sweep_mentor_user");

export interface SweepResult {
  reminded: number;
  expired: number;
}

/**
 * The 24-hour reminder and the 48-hour expiry (design D4). Both are conditional
 * updates, so a repeated run can never send a second reminder or expire twice;
 * the emails commit with the state change in one transaction.
 */
export async function sweepRequests(database: Database, now: Date = new Date()): Promise<SweepResult> {
  return await database.transaction(async (tx) => {
    const reminded = await tx
      .update(mentorshipRequests)
      .set({ reminderSentAt: now, updatedAt: now })
      .where(
        and(
          eq(mentorshipRequests.status, "PENDING"),
          isNull(mentorshipRequests.reminderSentAt),
          // A row already past expiry gets the expiry email, not a reminder.
          gt(mentorshipRequests.expiresAt, now),
          lte(mentorshipRequests.createdAt, new Date(now.getTime() - 24 * HOUR_MS)),
        ),
      )
      .returning({ id: mentorshipRequests.id });

    for (const row of reminded) {
      const [recipient] = await tx
        .select({ to: mentorUser.email, question: mentorshipRequests.question })
        .from(mentorshipRequests)
        .innerJoin(mentorProfiles, eq(mentorProfiles.id, mentorshipRequests.mentorProfileId))
        .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
        .where(eq(mentorshipRequests.id, row.id))
        .limit(1);
      if (!recipient) {
        continue;
      }
      await enqueueOutboxEvent(tx, {
        aggregateType: "MENTORSHIP_REQUEST",
        aggregateId: row.id,
        eventType: "EmailRequested",
        dedupeKey: `email:request-reminder:${row.id}`,
        payload: {
          to: recipient.to,
          template: "request-reminder",
          subject: "A mentorship request is still waiting",
          text: [
            "A mentorship request has waited 24 hours without a decision.",
            "",
            `Question: ${recipient.question}`,
            "",
            `It expires 48 hours after it was sent: ${appOrigin()}/requests`,
          ].join("\n"),
        },
      });
    }

    const expired = await tx
      .update(mentorshipRequests)
      .set({ status: "EXPIRED", expiryReason: "DEADLINE", updatedAt: now })
      .where(
        and(
          eq(mentorshipRequests.status, "PENDING"),
          lte(mentorshipRequests.expiresAt, now),
        ),
      )
      .returning({ id: mentorshipRequests.id });

    for (const row of expired) {
      const [recipient] = await tx
        .select({ to: studentUser.email })
        .from(mentorshipRequests)
        .innerJoin(studentProfiles, eq(studentProfiles.id, mentorshipRequests.studentProfileId))
        .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
        .where(eq(mentorshipRequests.id, row.id))
        .limit(1);
      if (!recipient) {
        continue;
      }
      await enqueueOutboxEvent(tx, {
        aggregateType: "MENTORSHIP_REQUEST",
        aggregateId: row.id,
        eventType: "EmailRequested",
        dedupeKey: `email:request-expired:${row.id}`,
        payload: {
          to: recipient.to,
          template: "request-expired",
          subject: "Your mentorship request expired",
          text: [
            "Your mentorship request expired without a decision.",
            "",
            `You can send a new request: ${appOrigin()}/requests`,
          ].join("\n"),
        },
      });
    }

    return { reminded: reminded.length, expired: expired.length };
  });
}
