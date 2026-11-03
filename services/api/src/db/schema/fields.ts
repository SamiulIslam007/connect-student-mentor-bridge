import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { citext, timestamps } from "./columns.js";
import { fieldStatus } from "./enums.js";

/**
 * Dynamic field taxonomy (D-08). `normalized_slug` is the identity of a concept:
 * "Data science", "data-science", and "DATA SCIENCE" all resolve to one row.
 * Created only as a side effect of a profile save; retiring never deletes.
 */
export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** First submitted display name; a later spelling of the same slug does not rewrite it. */
    name: text("name").notNull(),
    normalizedSlug: citext("normalized_slug").notNull(),
    /** Null when the creator's account is removed, or for a future seeded field. */
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: fieldStatus("status").default("ACTIVE").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("fields_normalized_slug_unique").on(table.normalizedSlug)],
);
