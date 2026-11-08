import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { timestamps } from "./columns.js";
import {
  contributionLevel,
  outcomeEventType,
  outcomeStatus,
  outcomeType,
  verifierDecision,
  verifierKind,
} from "./enums.js";
import { fields } from "./fields.js";
import { mentorProfiles, studentProfiles } from "./profiles.js";
import { mentorships } from "./mentorships.js";

/**
 * `outcomes.status` is a projection of `outcome_events`, written in the same
 * transaction as its event (docs/data-model.md §4.4, design D1). In this change
 * `COUNTED`, `REJECTED`, and `REVERSED` are unreachable: counting and review
 * belong to later changes.
 */
export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorshipId: uuid("mentorship_id")
      .notNull()
      .references(() => mentorships.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    outcomeType: outcomeType("outcome_type").notNull(),
    title: text("title"),
    description: text("description").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).defaultNow().notNull(),
    contributionClaimed: contributionLevel("contribution_claimed").notNull(),
    contributionConfirmed: contributionLevel("contribution_confirmed"),
    status: outcomeStatus("status").default("PENDING_CONFIRMATION").notNull(),
    /** Tier 0 only in the MVP (D-64); nothing writes 1 or 2 yet. */
    evidenceTier: smallint("evidence_tier").default(0).notNull(),
    /** Text rather than an enum, as the design's check constraint implies. */
    countedBasis: text("counted_basis"),
    coiDeclared: boolean("coi_declared").default(false).notNull(),
    isPaidRelationship: boolean("is_paid_relationship").default(false).notNull(),
    mentorDecisionDueAt: timestamp("mentor_decision_due_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    coolingEndsAt: timestamp("cooling_ends_at", { withTimezone: true }),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "outcomes_description_bounds",
      sql`length(${table.description}) BETWEEN 1 AND 2000`,
    ),
    check("outcomes_evidence_tier_range", sql`${table.evidenceTier} BETWEEN 0 AND 2`),
    check(
      "outcomes_counted_has_basis",
      sql`${table.status} <> 'COUNTED' OR ${table.countedBasis} IS NOT NULL`,
    ),
    check(
      "outcomes_counted_basis_known",
      sql`${table.countedBasis} IS NULL OR ${table.countedBasis} IN ('MENTOR_CONFIRMED', 'PLATFORM_DECISION')`,
    ),
    index("outcomes_mentor_field_status_idx").on(
      table.mentorProfileId,
      table.fieldId,
      table.status,
    ),
    index("outcomes_student_idx").on(table.studentProfileId),
    index("outcomes_due_idx").on(table.status, table.mentorDecisionDueAt),
    index("outcomes_cooling_idx").on(table.status, table.coolingEndsAt),
  ],
);

/**
 * Append-only: migration `0013` grants the application role `SELECT, INSERT`
 * only, and `database.integration.test.ts` asserts UPDATE and DELETE are refused.
 */
export const outcomeEvents = pgTable(
  "outcome_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id, { onDelete: "cascade" }),
    /** Gap-free per outcome; allocated under the outcome row lock (design D2). */
    seq: integer("seq").notNull(),
    eventType: outcomeEventType("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role"),
    fromStatus: outcomeStatus("from_status"),
    toStatus: outcomeStatus("to_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    requestId: text("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outcome_events_seq_unique").on(table.outcomeId, table.seq),
    // One reminder and one escalation per outcome, enforced by the database.
    uniqueIndex("outcome_events_timer_once")
      .on(table.outcomeId, table.eventType)
      .where(sql`${table.eventType} IN ('REMINDER_D3_SENT', 'REMINDER_D5_SENT', 'ESCALATED_D7')`),
    index("outcome_events_outcome_idx").on(table.outcomeId, table.seq),
  ],
);

/** Append-only attestations: who attested what and how. */
export const verificationRecords = pgTable(
  "verification_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id, { onDelete: "cascade" }),
    kind: verifierKind("kind").notNull(),
    decision: verifierDecision("decision").notNull(),
    attesterUserId: text("attester_user_id").references(() => users.id, { onDelete: "restrict" }),
    contributionLevel: contributionLevel("contribution_level"),
    coiDeclaration: jsonb("coi_declaration").$type<Record<string, unknown>>(),
    statement: text("statement"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_records_outcome_idx").on(table.outcomeId)],
);
