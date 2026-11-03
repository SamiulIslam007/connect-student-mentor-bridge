import { customType, timestamp } from "drizzle-orm/pg-core";

/** `citext` compares case-insensitively; the extension ships with PostgreSQL. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

/** `created_at` and `updated_at` for every mutable table. UTC, timezone-aware. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
