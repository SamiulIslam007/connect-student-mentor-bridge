import { createDatabaseConnection } from "../database.js";
import { resolveDatabaseUrl } from "../database-url.js";
import { demoSeedRefusal, seedDemoMentors } from "./demo-mentors.js";

async function main(): Promise<void> {
  const refusal = demoSeedRefusal(process.env);
  if (refusal) {
    throw new Error(refusal);
  }

  const connection = createDatabaseConnection(resolveDatabaseUrl());
  try {
    const result = await seedDemoMentors(connection.db);
    console.log(
      JSON.stringify({
        event: "seed.demo_mentors",
        inserted: result.inserted.length,
        skipped: result.skipped.length,
      }),
    );
  } finally {
    await connection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "seed.demo_mentors_failed",
      message: error instanceof Error ? error.message : "unknown error",
    }),
  );
  process.exit(1);
});
