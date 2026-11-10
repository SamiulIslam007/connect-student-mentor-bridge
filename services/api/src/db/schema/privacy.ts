import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { privacyRequestKind, privacyRequestStatus } from "./enums.js";

/**
 * One row per export or deletion request, written inside the transaction that
 * does the work, so a request is a record and not only a response (D-84, D-85).
 */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: privacyRequestKind("kind").notNull(),
    status: privacyRequestStatus("status").default("COMPLETED").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("privacy_requests_user_kind_idx").on(table.userId, table.kind, table.requestedAt),
  ],
);
