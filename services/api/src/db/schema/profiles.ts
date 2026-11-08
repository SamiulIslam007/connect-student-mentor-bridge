import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { timestamps } from "./columns.js";
import { mentorAccessMode, mentorOnboardingStatus, mentorStatus } from "./enums.js";
import { fields } from "./fields.js";

export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goals: text("goals").notNull(),
    primaryFieldId: uuid("primary_field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    /** ISO 639-1 mentoring languages; independent of the English-only UI. */
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (table) => [uniqueIndex("student_profiles_user_id_unique").on(table.userId)],
);

/** Interests are additional to the primary field, never a duplicate of it. */
export const studentFieldInterests = pgTable(
  "student_field_interests",
  {
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.studentProfileId, table.fieldId] })],
);

export const mentorProfiles = pgTable(
  "mentor_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Single source of truth for the primary field; `mentor_fields` holds additions only. */
    primaryFieldId: uuid("primary_field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    status: mentorStatus("status").default("DRAFT").notNull(),
    /** Verification progress; never written into the operating enum (§5.2). */
    onboardingStatus: mentorOnboardingStatus("onboarding_status").default("APPLIED").notNull(),
    /** Set once when the mentor first becomes ACTIVE; never cleared. */
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    headline: text("headline").notNull(),
    bio: text("bio").notNull(),
    expertiseSummary: text("expertise_summary").notNull(),
    scopeStatement: text("scope_statement").notNull(),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    // Only the lower bound is DDL; the upper bound is policy (D-38, MENTOR_WEEKLY_CAPACITY_MAX).
    weeklyCapacity: smallint("weekly_capacity").notNull(),
    /** OPEN or APPLICATION_ONLY on save; PAUSED only through pause/resume. */
    accessMode: mentorAccessMode("access_mode").default("OPEN").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mentor_profiles_user_id_unique").on(table.userId),
    check("mentor_profiles_weekly_capacity_min", sql`${table.weeklyCapacity} >= 1`),
  ],
);

/** Additional mentor fields; the primary field lives on `mentor_profiles`. */
export const mentorFields = pgTable(
  "mentor_fields",
  {
    mentorProfileId: uuid("mentor_profile_id")
      .notNull()
      .references(() => mentorProfiles.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.mentorProfileId, table.fieldId] })],
);
