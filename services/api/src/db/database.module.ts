import { Inject, Injectable, Module, type OnApplicationShutdown, type Provider } from "@nestjs/common";
import type { Pool } from "pg";

import { createDatabaseConnection, type Database, type DatabaseConnection } from "./database.js";
import { resolveDatabaseUrl } from "./database-url.js";

export const DATABASE_CONNECTION = "DATABASE_CONNECTION";
export const DATABASE_POOL = "DATABASE_POOL";
export const DATABASE = "DATABASE";

const connectionProvider: Provider = {
  provide: DATABASE_CONNECTION,
  // Resolved from the environment or the repository-root .env; fails loudly at
  // boot instead of letting `pg` fall back to libpq defaults.
  useFactory: (): DatabaseConnection => createDatabaseConnection(resolveDatabaseUrl()),
};

const poolProvider: Provider = {
  provide: DATABASE_POOL,
  inject: [DATABASE_CONNECTION],
  useFactory: (connection: DatabaseConnection): Pool => connection.pool,
};

const databaseProvider: Provider = {
  provide: DATABASE,
  inject: [DATABASE_CONNECTION],
  useFactory: (connection: DatabaseConnection): Database => connection.db,
};

@Injectable()
class DatabasePoolCloser implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [connectionProvider, poolProvider, databaseProvider, DatabasePoolCloser],
  exports: [DATABASE_POOL, DATABASE],
})
export class DatabaseModule {}

export type { Database };
