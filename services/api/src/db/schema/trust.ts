import {
  boolean,
  char,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { citext, timestamps } from "./columns.js";
import {
  consentAction,
  consentPurpose,
  institutionKind,
  institutionStatus,
  signupBlockReason,
} from "./enums.js";

export const institutions = pgTable("institutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: institutionKind("kind").notNull(),
  countryCode: char("country_code", { length: 2 }).notNull(),
  status: institutionStatus("status").default("ONBOARDING").notNull(),
  mouSignedOn: date("mou_signed_on"),
  minCohortSize: smallint("min_cohort_size"),
  ...timestamps,
});

export const institutionDomains = pgTable(
  "institution_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    domain: citext("domain").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("institution_domains_domain_unique").on(table.domain),
    index("institution_domains_institution_id_idx").on(table.institutionId),
  ],
);

/**
 * Append-only: migration `0000` grants the application role INSERT and SELECT
 * only, and the test suite asserts that UPDATE and DELETE are refused.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: consentPurpose("purpose").notNull(),
    action: consentAction("action").notNull(),
    documentVersion: text("document_version").notNull(),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("consent_records_user_purpose_idx").on(table.userId, table.purpose, table.occurredAt)],
);

/** Append-only audit trail; metadata never holds passwords, hashes, tokens, or raw email. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").default("ANONYMOUS").notNull(),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    /** Null when the attempt has no object yet (for example a failed sign-in). */
    objectId: text("object_id"),
    requestId: text("request_id").notNull(),
    breakGlass: boolean("break_glass").default(false).notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (table) => [
    index("audit_logs_object_idx").on(table.objectType, table.objectId, table.occurredAt),
    index("audit_logs_actor_idx").on(table.actorUserId, table.occurredAt),
  ],
);

/**
 * Keyed email hash only (HMAC-SHA-256 with `BETTER_AUTH_SECRET`). The date of
 * birth is never stored anywhere.
 */
export const signupBlocks = pgTable(
  "signup_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailHash: text("email_hash").notNull().unique(),
    reason: signupBlockReason("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("signup_blocks_expires_at_idx").on(table.expiresAt)],
);
