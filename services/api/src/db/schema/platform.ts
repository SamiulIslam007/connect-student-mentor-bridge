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

import { timestamps } from "./columns.js";

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
