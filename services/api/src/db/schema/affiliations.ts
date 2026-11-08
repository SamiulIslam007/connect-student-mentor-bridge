import { sql } from "drizzle-orm";
import {
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
import { citext, timestamps } from "./columns.js";
import {
  affiliationKind,
  affiliationLevel,
  affiliationMethod,
  affiliationStatus,
} from "./enums.js";
import { institutions } from "./trust.js";

/**
 * Affiliation claims (docs/data-model.md §5.1). Rows are revoked, never deleted,
 * and at most one may be `VERIFIED` per account (FR-PROF-05, design D1).
 */
export const affiliations = pgTable(
  "affiliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    /** Level 2 is employer-based; the pilot stores neither value yet. */
    organizationName: text("organization_name"),
    organizationDomain: citext("organization_domain"),
    kind: affiliationKind("kind").notNull(),
    department: text("department"),
    program: text("program"),
    batchYear: smallint("batch_year"),
    level: affiliationLevel("level").notNull(),
    method: affiliationMethod("method").notNull(),
    status: affiliationStatus("status").notNull(),
    decidedByUserId: text("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decisionReason: text("decision_reason"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Affiliation expiry is still an open decision (§4.3); nothing writes it. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "affiliations_institution_or_organization",
      sql`${table.institutionId} IS NOT NULL OR ${table.organizationName} IS NOT NULL`,
    ),
    check(
      "affiliations_batch_year_range",
      sql`${table.batchYear} IS NULL OR ${table.batchYear} BETWEEN 1900 AND 2200`,
    ),
    uniqueIndex("affiliations_one_verified_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'VERIFIED'`),
    index("affiliations_user_id_idx").on(table.userId),
    index("affiliations_institution_id_idx").on(table.institutionId),
  ],
);
