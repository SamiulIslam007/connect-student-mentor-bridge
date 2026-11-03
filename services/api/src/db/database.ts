import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  pool: Pool;
  db: Database;
}

/**
 * One pooled connection per process. `pg` connects lazily, so the API still
 * boots and answers `/healthz` when the database is down; `/readyz` reports it.
 */
export function createDatabaseConnection(connectionString: string | undefined): DatabaseConnection {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
  // Without a listener an idle-client error (database restart, network drop) is
  // an uncaught exception and the process exits.
  pool.on("error", (error: Error) => {
    console.error(JSON.stringify({ event: "db.pool_error", message: error.message }));
  });
  return { pool, db: drizzle(pool, { schema }) };
}
