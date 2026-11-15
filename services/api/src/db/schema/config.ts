import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

/**
 * Immutable configuration versions (`FR-ADM-07`, design R3). One row per
 * published set of runtime tunables, with a sha256 digest of its payload.
 * Migration `0021` grants the application role `SELECT, INSERT` only, so a
 * stored version cannot be edited; `reputation_events.config_version_id` is
 * `ON DELETE RESTRICT`, so a version a ledger row names cannot be removed.
 *
 * `created_by_user_id` is nullable for exactly one row: the version-1 baseline
 * the migration seeds before any account exists. Every route-written version
 * names its actor (D-184).
 */
export const configVersions = pgTable(
  "config_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    digest: text("digest").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("config_versions_version_unique").on(table.version),
    check(
      "config_versions_reason_length",
      sql`char_length(${table.reason}) >= 1 AND char_length(${table.reason}) <= 1000`,
    ),
    check("config_versions_digest_hex", sql`${table.digest} ~ '^[0-9a-f]{64}$'`),
  ],
);
