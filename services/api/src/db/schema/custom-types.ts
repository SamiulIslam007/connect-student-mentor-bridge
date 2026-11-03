import { customType } from "drizzle-orm/pg-core";

/** `citext` compares case-insensitively; the `citext` extension ships with PostgreSQL. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});
