import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { timestamps } from "./columns.js";
import { availabilityContext } from "./enums.js";

/**
 * Weekly availability per context (docs/data-model.md §5.2). Minutes are
 * wall-clock minutes in the row's own zone, so the #6 match factor stays a pure
 * comparison. The checks mirror `validateAvailabilityWindows`.
 */
export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    context: availabilityContext("context").notNull(),
    weekday: smallint("weekday").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    timezone: text("timezone").notNull(),
    ...timestamps,
  },
  (table) => [
    check("availability_windows_weekday_range", sql`${table.weekday} BETWEEN 1 AND 7`),
    check("availability_windows_start_range", sql`${table.startMinute} BETWEEN 0 AND 1440`),
    check("availability_windows_end_range", sql`${table.endMinute} BETWEEN 0 AND 1440`),
    check("availability_windows_end_after_start", sql`${table.endMinute} > ${table.startMinute}`),
    index("availability_windows_user_context_idx").on(table.userId, table.context),
  ],
);
