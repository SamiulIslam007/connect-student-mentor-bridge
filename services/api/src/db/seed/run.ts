import { createDatabaseConnection } from "../database.js";
import { resolveDatabaseUrl } from "../database-url.js";
import {
  AFFILIATION_ATTESTATIONS,
  seedAffiliationAttestations,
} from "./affiliations.js";
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

    const attestations = await seedAffiliationAttestations(
      connection.db,
      AFFILIATION_ATTESTATIONS,
    );
    console.log(
      JSON.stringify({
        event: "seed.affiliations",
        granted: attestations.granted,
        skipped: attestations.skipped,
      }),
    );
  } finally {
    await connection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ event: "seed.failed", message: error instanceof Error ? error.message : "unknown error" }),
  );
  process.exit(1);
});
