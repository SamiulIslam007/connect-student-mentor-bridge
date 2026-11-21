import { createDatabaseConnection } from "../../services/api/src/db/database.ts";
import { countDueOutcomes } from "../../services/api/src/reputation/counting-job.ts";
import { testDatabaseUrl } from "./env";

/**
 * The counting pass, run the way the `reputation-counter` job runs it, with a
 * `now` far enough ahead that every confirmed outcome's cooling deadline has
 * passed. No clock is changed and no row is edited by hand.
 */
const daysAhead = Number(process.argv[2] ?? "30");

async function main(): Promise<void> {
  const connection = createDatabaseConnection(testDatabaseUrl());
  try {
    const result = await countDueOutcomes(
      connection.db,
      new Date(Date.now() + daysAhead * 86_400_000),
    );
    console.log(JSON.stringify({ event: "e2e.count_due_outcomes", daysAhead, ...result }));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
