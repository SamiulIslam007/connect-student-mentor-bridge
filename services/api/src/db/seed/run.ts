import { createDatabaseConnection } from "../database.js";
import { resolveDatabaseUrl } from "../database-url.js";
import { INSTITUTION_SEED, seedInstitutions } from "./institutions.js";

async function main(): Promise<void> {
  const connection = createDatabaseConnection(resolveDatabaseUrl());
  try {
    const result = await seedInstitutions(connection.db, INSTITUTION_SEED);
    console.log(
      JSON.stringify({
        event: "seed.institutions",
        institutions: result.institutions,
        domains: result.domains,
        inserted_institutions: result.inserted.institutions,
        inserted_domains: result.inserted.domains,
      }),
    );
  } finally {
    await connection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ event: "seed.institutions_failed", message: error instanceof Error ? error.message : "unknown error" }),
  );
  process.exit(1);
});
