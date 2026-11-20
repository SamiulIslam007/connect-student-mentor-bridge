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

/**
 * The idempotency store (SEC-API-7, design R1 to R4). One row per caller,
 * operation and client key; `status` is plumbing and never reaches a payload, so
 * it is text with a check rather than a product enum. `expires_at` is rewritten
 * on completion: five minutes for an intent, twenty-four hours for a response.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestDigest: text("request_digest").notNull(),
    status: text("status").default("IN_PROGRESS").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check("idempotency_keys_status_known", sql`${table.status} in ('IN_PROGRESS', 'COMPLETED')`),
    uniqueIndex("idempotency_keys_scope_unique").on(
      table.actorUserId,
      table.operation,
      table.key,
    ),
    index("idempotency_keys_expires_idx").on(table.expiresAt),
  ],
);
