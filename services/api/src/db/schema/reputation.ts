import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { outcomeType, reputationEventType } from "./enums.js";
import { fields } from "./fields.js";
import { mentorProfiles, studentProfiles } from "./profiles.js";
import { outcomes } from "./outcomes.js";

/**
 * Append-only reputation ledger (docs/data-model.md §5.6, design D6). Migration
 * `0014` grants the application role `SELECT, INSERT` only; the multipliers the
 * event applied are copied onto the row, so a later config change cannot rewrite
 * history.
 */
export const reputationEvents = pgTable(
  "reputation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id, { onDelete: "restrict" }),
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    outcomeType: outcomeType("outcome_type").notNull(),
    eventType: reputationEventType("event_type").notNull(),
    difficultyWeight: numeric("difficulty_weight", { precision: 6, scale: 4 }).notNull(),
    tierMultiplier: numeric("tier_multiplier", { precision: 6, scale: 4 }).notNull(),
    contributionMultiplier: numeric("contribution_multiplier", { precision: 6, scale: 4 }).notNull(),
    pairFactor: numeric("pair_factor", { precision: 6, scale: 4 }).notNull(),
    points: numeric("points", { precision: 12, scale: 6 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reputation_events_outcome_unique").on(table.outcomeId),
    check("reputation_events_counted_only", sql`${table.eventType} = 'COUNTED'`),
    index("reputation_events_mentor_field_idx").on(
      table.mentorProfileId,
      table.fieldId,
      table.occurredAt,
    ),
  ],
);

/**
 * A materialized total per (mentor, field, outcome type), written only by the
 * counting job and recomputable from `reputation_events` (design D3/D4).
 * `points_total` never leaves the server.
 */
export const fieldImpactSnapshots = pgTable(
  "field_impact_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    outcomeType: outcomeType("outcome_type").notNull(),
    countedCount: integer("counted_count").default(0).notNull(),
    pointsTotal: numeric("points_total", { precision: 12, scale: 6 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("field_impact_snapshots_key").on(
      table.mentorProfileId,
      table.fieldId,
      table.outcomeType,
    ),
    check("field_impact_snapshots_count_non_negative", sql`${table.countedCount} >= 0`),
  ],
);
