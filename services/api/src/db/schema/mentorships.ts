import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { timestamps } from "./columns.js";
import { mentorshipCadence, mentorshipSessionStatus, mentorshipStatus } from "./enums.js";
import { fields } from "./fields.js";
import { mentorProfiles, studentProfiles } from "./profiles.js";
import { mentorshipRequests } from "./requests.js";

/**
 * A mentorship exists only because a request was accepted (docs/data-model.md
 * §5.3). `field_id` is copied from the request at acceptance, because reputation
 * is field-scoped and must not follow a later profile edit.
 */
export const mentorships = pgTable(
  "mentorships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => mentorshipRequests.id, { onDelete: "restrict" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    status: mentorshipStatus("status").default("ACTIVE").notNull(),
    cadence: mentorshipCadence("cadence"),
    plannedWeeks: smallint("planned_weeks"),
    goal: text("goal"),
    studentAckAt: timestamp("student_ack_at", { withTimezone: true }),
    mentorAckAt: timestamp("mentor_ack_at", { withTimezone: true }),
    /** Inert in the MVP: no writer exists until payments land (Phase 3). */
    isPaid: boolean("is_paid").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedByUserId: text("ended_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mentorships_request_id_unique").on(table.requestId),
    check("mentorships_not_paid", sql`${table.isPaid} = false`),
    check(
      "mentorships_planned_weeks_range",
      sql`${table.plannedWeeks} IS NULL OR (${table.plannedWeeks} >= 1 AND ${table.plannedWeeks} <= 52)`,
    ),
    check(
      "mentorships_ended_after_start",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`,
    ),
    // The resume capacity check counts live mentorships per mentor.
    index("mentorships_mentor_active_idx")
      .on(table.mentorProfileId, table.status)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

/** Immutable text rows: no updated_at, no read state, no edits in this change. */
export const threadMessages = pgTable(
  "thread_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorshipId: uuid("mentorship_id")
      .notNull()
      .references(() => mentorships.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("thread_messages_keyset_idx").on(table.mentorshipId, table.createdAt, table.id)],
);

/**
 * A planned session. `HELD` is written only when both participants have
 * confirmed the session happened, so the two timestamps are the evidence.
 */
export const mentorshipSessions = pgTable(
  "mentorship_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorshipId: uuid("mentorship_id")
      .notNull()
      .references(() => mentorships.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    meetingUrl: text("meeting_url").notNull(),
    status: mentorshipSessionStatus("status").default("SCHEDULED").notNull(),
    studentConfirmedHeldAt: timestamp("student_confirmed_held_at", { withTimezone: true }),
    mentorConfirmedHeldAt: timestamp("mentor_confirmed_held_at", { withTimezone: true }),
    cancelledByUserId: text("cancelled_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (table) => [
    check("mentorship_sessions_https_link", sql`${table.meetingUrl} LIKE 'https://%'`),
    check(
      "mentorship_sessions_duration_range",
      sql`${table.durationMinutes} >= 15 AND ${table.durationMinutes} <= 240`,
    ),
    check(
      "mentorship_sessions_held_has_both_confirmations",
      sql`${table.status} <> 'HELD' OR (${table.studentConfirmedHeldAt} IS NOT NULL AND ${table.mentorConfirmedHeldAt} IS NOT NULL)`,
    ),
    index("mentorship_sessions_schedule_idx").on(table.mentorshipId, table.scheduledStart),
  ],
);
