import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns.js";
import { interactionType, outcomeType, requestStatus, timeframeBucket } from "./enums.js";
import { fields } from "./fields.js";
import { mentorProfiles, studentProfiles } from "./profiles.js";

/**
 * Structured mentorship requests (docs/data-model.md §5.3, design D1). The MVP
 * column subset omits the match snapshot (#6), redirects (Phase 1b), and
 * `ai_assisted` (never true).
 */
export const mentorshipRequests = pgTable(
  "mentorship_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    question: text("question").notNull(),
    contextSummary: text("context_summary").notNull(),
    targetOutcome: text("target_outcome").notNull(),
    targetOutcomeType: outcomeType("target_outcome_type"),
    timeframe: timeframeBucket("timeframe").notNull(),
    interactionType: interactionType("interaction_type").default("ASYNC_THREAD").notNull(),
    applicationNote: text("application_note"),
    status: requestStatus("status").default("PENDING").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    /** Created + 48 hours (owner decision). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /**
     * Why the request left `PENDING` for `EXPIRED`: the 48-hour deadline or the
     * mentor losing their last verified affiliation (D-166). Null while open.
     */
    expiryReason: text("expiry_reason"),
    /** At 24 hours (owner decision). */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "mentorship_requests_no_group_office_hours",
      sql`${table.interactionType} <> 'GROUP_OFFICE_HOURS'`,
    ),
    check("mentorship_requests_version_min", sql`${table.version} >= 1`),
    check("mentorship_requests_expires_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "mentorship_requests_expiry_reason_known",
      sql`${table.expiryReason} is null or ${table.expiryReason} in ('DEADLINE', 'MENTOR_INELIGIBLE')`,
    ),
    uniqueIndex("mentorship_requests_one_pending_per_pair")
      .on(table.studentProfileId, table.mentorProfileId)
      .where(sql`${table.status} = 'PENDING'`),
    index("mentorship_requests_mentor_status_idx").on(table.mentorProfileId, table.status),
    index("mentorship_requests_student_status_idx").on(table.studentProfileId, table.status),
    index("mentorship_requests_due_idx").on(table.status, table.expiresAt),
  ],
);
