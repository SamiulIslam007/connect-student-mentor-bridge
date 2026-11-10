import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { timestamps } from "./columns.js";
import { reportKind, reportStatus } from "./enums.js";

/**
 * Transactional outbox (docs/data-model.md §5.8, design D1). A state change
 * writes its event here in the same transaction; the worker relays due rows into
 * pg-boss. `dedupe_key` makes a retried request insert nothing.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    /** Set when the attempt budget is exhausted; the row is kept, never deleted. */
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    check("outbox_events_attempts_min", sql`${table.attempts} >= 0`),
    uniqueIndex("outbox_events_dedupe_key_unique").on(table.dedupeKey),
    index("outbox_events_due_idx").on(table.processedAt, table.availableAt),
  ],
);

/**
 * Moderation queue (design D1 of `abuse-reports-and-sanctions`). One flat table
 * with `target_kind` + `target_id`: the four targets live in four tables, so the
 * target is verified per kind in the service rather than by a foreign key.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetKind: reportKind("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    /** Fixed set, enforced by the contract and a check; free text lives in `details`. */
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").default("OPEN").notNull(),
    /** `ACTIONED` or `DISMISSED` once resolved; null while open. */
    decision: text("decision"),
    resolutionReason: text("resolution_reason"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "reports_reason_known",
      sql`${table.reason} IN ('HARASSMENT', 'SPAM', 'IMPERSONATION', 'MISREPRESENTATION', 'OTHER')`,
    ),
    check(
      "reports_details_bounds",
      sql`${table.details} IS NULL OR length(${table.details}) BETWEEN 1 AND 2000`,
    ),
    check(
      "reports_decision_known",
      sql`${table.decision} IS NULL OR ${table.decision} IN ('ACTIONED', 'DISMISSED')`,
    ),
    check(
      "reports_resolution_complete",
      sql`${table.status} = 'OPEN' OR (${table.decision} IS NOT NULL AND ${table.resolvedByUserId} IS NOT NULL AND ${table.resolvedAt} IS NOT NULL)`,
    ),
    index("reports_status_idx").on(table.status, table.createdAt),
  ],
);
