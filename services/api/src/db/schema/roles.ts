import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { role } from "./enums.js";
import { institutions } from "./trust.js";

/**
 * Role assignments (docs/data-model.md §5.1): revoked, never deleted, and at
 * most one active row per (user, role, institution). Postgres treats NULLs as
 * distinct, so the active-row index folds a missing scope to one sentinel value.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: role("role").notNull(),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    /** Null for a system grant, for example the registration default. */
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("role_assignments_active_unique")
      .on(
        table.userId,
        table.role,
        sql`COALESCE(${table.institutionId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      "role_assignments_institution_required",
      sql`${table.role} <> 'INSTITUTION_ADMIN' OR ${table.institutionId} IS NOT NULL`,
    ),
    index("role_assignments_user_id_idx").on(table.userId),
  ],
);
