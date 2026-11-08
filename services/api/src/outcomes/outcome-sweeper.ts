import { and, eq, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { REMINDER_DAYS } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  mentorProfiles,
  mentorships,
  outcomeEvents,
  outcomes,
  studentProfiles,
  users,
} from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bounded per run, so one slow batch cannot starve the request sweeper. */
const BATCH = 100;

const studentUser = alias(users, "sweep_outcome_student");
const mentorUser = alias(users, "sweep_outcome_mentor");

function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through.
    }
  }
  return "http://localhost:3000";
}

export interface OutcomeSweepResult {
  reminded: number;
  escalated: number;
}

async function recipients(database: Parameters<Parameters<Database["transaction"]>[0]>[0], outcomeId: string) {
  const [row] = await database
    .select({
      mentorshipId: outcomes.mentorshipId,
      studentEmail: studentUser.email,
      mentorEmail: mentorUser.email,
    })
    .from(outcomes)
    .innerJoin(mentorships, eq(mentorships.id, outcomes.mentorshipId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
    .innerJoin(studentUser, eq(studentUser.id, studentProfiles.userId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentorProfiles.userId))
    .where(eq(outcomes.id, outcomeId))
    .limit(1);
  return row ?? null;
}

/**
 * The day-3 and day-5 reminders and the day-7 escalation (data-model T5). Every
 * effect is guarded by the partial unique index on the event table, so a second
 * run writes nothing; a decided outcome is skipped by the status re-check under
 * the row lock.
 */
export async function sweepOutcomes(
  database: Database,
  now: Date = new Date(),
): Promise<OutcomeSweepResult> {
  const due = await database
    .select({ id: outcomes.id })
    .from(outcomes)
    .where(
      and(
        eq(outcomes.status, "PENDING_CONFIRMATION"),
        lte(outcomes.createdAt, new Date(now.getTime() - REMINDER_DAYS.first * DAY_MS)),
      ),
    )
    .limit(BATCH);

  let reminded = 0;
  let escalated = 0;

  for (const candidate of due) {
    await database.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          id: outcomes.id,
          status: outcomes.status,
          createdAt: outcomes.createdAt,
          mentorDecisionDueAt: outcomes.mentorDecisionDueAt,
        })
        .from(outcomes)
        .where(eq(outcomes.id, candidate.id))
        .for("update")
        .limit(1);
      if (!locked || locked.status !== "PENDING_CONFIRMATION") {
        return;
      }
      const people = await recipients(tx, locked.id);
      if (!people) {
        return;
      }

      const [seqRow] = await tx
        .select({ value: sql<number>`coalesce(max(${outcomeEvents.seq}), 0)` })
        .from(outcomeEvents)
        .where(eq(outcomeEvents.outcomeId, locked.id));
      let seq = Number(seqRow?.value ?? 0);

      const age = now.getTime() - locked.createdAt.getTime();
      for (const [day, eventType] of [
        [REMINDER_DAYS.first, "REMINDER_D3_SENT"],
        [REMINDER_DAYS.second, "REMINDER_D5_SENT"],
      ] as const) {
        if (age < day * DAY_MS) {
          continue;
        }
        if (now.getTime() >= locked.mentorDecisionDueAt.getTime()) {
          // The escalation below closes the decision window; a reminder after
          // the deadline would be noise.
          continue;
        }
        const inserted = await tx
          .insert(outcomeEvents)
          .values({
            outcomeId: locked.id,
            seq: seq + 1,
            eventType,
            fromStatus: "PENDING_CONFIRMATION",
            toStatus: "PENDING_CONFIRMATION",
            actorRole: "SYSTEM",
            requestId: "system:outcome-sweeper",
            payload: { day },
          })
          .onConflictDoNothing()
          .returning({ id: outcomeEvents.id });
        if (inserted.length === 0) {
          continue;
        }
        seq += 1;
        reminded += 1;
        await enqueueOutboxEvent(tx, {
          aggregateType: "OUTCOME",
          aggregateId: locked.id,
          eventType: "EmailRequested",
          dedupeKey: `email:outcome-reminder-${eventType}:${locked.id}`,
          payload: {
            to: people.mentorEmail,
            template: "outcome-reminder",
            subject: "An outcome is still waiting for your decision",
            text: [
              `An outcome has waited ${day} days for your decision.`,
              "",
              `Decide before day 7, when it moves to platform review: ${appOrigin()}/mentorship/${people.mentorshipId}`,
            ].join("\n"),
          },
        });
      }

      if (now.getTime() < locked.mentorDecisionDueAt.getTime()) {
        return;
      }

      const updated = await tx
        .update(outcomes)
        .set({ status: "IN_PLATFORM_REVIEW", updatedAt: now })
        .where(and(eq(outcomes.id, locked.id), eq(outcomes.status, "PENDING_CONFIRMATION")))
        .returning({ id: outcomes.id });
      if (updated.length === 0) {
        return;
      }
      await tx
        .insert(outcomeEvents)
        .values({
          outcomeId: locked.id,
          seq: seq + 1,
          eventType: "ESCALATED_D7",
          fromStatus: "PENDING_CONFIRMATION",
          toStatus: "IN_PLATFORM_REVIEW",
          actorRole: "SYSTEM",
          requestId: "system:outcome-sweeper",
          payload: {},
        })
        .onConflictDoNothing();
      await appendAuditEntry(tx, {
        action: "OUTCOME_ESCALATED",
        actorRole: "SYSTEM",
        objectType: "outcomes",
        objectId: locked.id,
        requestId: "system:outcome-sweeper",
      });
      escalated += 1;
      for (const to of [people.studentEmail, people.mentorEmail]) {
        await enqueueOutboxEvent(tx, {
          aggregateType: "OUTCOME",
          aggregateId: locked.id,
          eventType: "EmailRequested",
          dedupeKey: `email:outcome-escalated:${locked.id}:${to}`,
          payload: {
            to,
            template: "outcome-escalated",
            subject: "An outcome went to platform review",
            text: [
              "The mentor did not decide within seven days, so the outcome is in platform review.",
              "",
              `Open it: ${appOrigin()}/mentorship/${people.mentorshipId}`,
            ].join("\n"),
          },
        });
      }
    });
  }

  return { reminded, escalated };
}
