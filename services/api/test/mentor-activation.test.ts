import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { createDatabaseConnection, type Database } from "../src/db/database.js";
import { syncMentorActivation } from "../src/onboarding/mentor-activation.js";
import {
  openTestDatabase,
  testDatabaseUrl,
  truncateAll,
  type TestDatabase,
} from "./support/database.js";

/**
 * The conditional write in the one activation funnel (D-150). The reads are
 * served by a small stand-in so the test can hand the function a status the row
 * no longer has, which is exactly what a concurrent suspension looks like; the
 * write itself runs against the real table.
 */

let database: TestDatabase | undefined;
let connection: { pool: { end: () => Promise<void> }; db: Database } | undefined;

before(async () => {
  database = await openTestDatabase();
  if (database.skipped) {
    return;
  }
  connection = createDatabaseConnection(testDatabaseUrl());
});

beforeEach(async () => {
  if (database && !database.skipped) {
    await truncateAll(database.client);
  }
});

after(async () => {
  await connection?.pool.end();
  if (database && !database.skipped) {
    await database.client.end();
  }
});

function requireDatabase(context: TestContext): TestDatabase | null {
  if (!database || database.skipped) {
    context.skip(database?.reason ?? "connect_test is not reachable");
    return null;
  }
  return database;
}

interface StaleProfile {
  status: string;
  activatedAt: Date | null;
  emailVerified: boolean;
  mfaEnrolled: boolean;
  orientationCompletedAt: Date | null;
}

/** Serves the sync's three reads from the given profile row, and nothing else. */
function staleReads(profile: StaleProfile): unknown {
  const results: unknown[][] = [[profile], [], []];
  let call = 0;
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(results[call++] ?? []),
    orderBy: () => Promise.resolve(results[call++] ?? []),
  };
  return { select: () => builder };
}

async function seedMentorProfile(
  current: TestDatabase,
  status: string,
): Promise<{ userId: string; profileId: string }> {
  const user = await current.client.query<{ id: string }>(
    `INSERT INTO users (id, name, email, email_verified, status)
     VALUES ('activation-test-user', 'Activation Test', 'activation.test@example.com', true, 'ACTIVE')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  const userId = user.rows[0].id;
  const field = await current.client.query<{ id: string }>(
    `INSERT INTO fields (name, normalized_slug, created_by_user_id)
     VALUES ('Activation field', 'activation field', $1) RETURNING id`,
    [userId],
  );
  const profile = await current.client.query<{ id: string }>(
    `INSERT INTO mentor_profiles
       (user_id, primary_field_id, status, onboarding_status, headline, bio,
        expertise_summary, scope_statement, weekly_capacity)
     VALUES ($1, $2, $3::mentor_status, 'APPLIED', 'Headline', 'Bio', 'Expertise', 'Scope', 2)
     RETURNING id`,
    [userId, field.rows[0].id, status],
  );
  return { userId, profileId: profile.rows[0].id };
}

async function storedStatus(current: TestDatabase, userId: string): Promise<string> {
  const row = await current.client.query<{ status: string }>(
    "SELECT status FROM mentor_profiles WHERE user_id = $1",
    [userId],
  );
  return row.rows[0].status;
}

test("a status another actor changed is not overwritten", async (context) => {
  const current = requireDatabase(context);
  if (!current || !connection) return;

  const seeded = await seedMentorProfile(current, "DRAFT");
  const db = connection.db;
  // Another actor suspends the profile after the sync's read would have seen DRAFT.
  await current.client.query("UPDATE mentor_profiles SET status = 'SUSPENDED' WHERE user_id = $1", [
    seeded.userId,
  ]);

  const executor = {
    ...(staleReads({
      status: "DRAFT",
      activatedAt: null,
      emailVerified: true,
      mfaEnrolled: true,
      orientationCompletedAt: null,
    }) as { select: unknown }),
    update: (table: Parameters<Database["update"]>[0]) => db.update(table),
  };

  await syncMentorActivation(executor as unknown as Parameters<typeof syncMentorActivation>[0], seeded.userId);

  // Without the status condition the write would land as PENDING (DRAFT plus an
  // enrolled factor), which is what this assertion catches.
  assert.equal(await storedStatus(current, seeded.userId), "SUSPENDED", "the concurrent status wins");
});

test("an unchanged status still takes the computed one", async (context) => {
  const current = requireDatabase(context);
  if (!current || !connection) return;

  const seeded = await seedMentorProfile(current, "DRAFT");
  const db = connection.db;

  const executor = {
    ...(staleReads({
      status: "DRAFT",
      activatedAt: null,
      emailVerified: true,
      mfaEnrolled: true,
      orientationCompletedAt: null,
    }) as { select: unknown }),
    update: (table: Parameters<Database["update"]>[0]) => db.update(table),
  };

  await syncMentorActivation(executor as unknown as Parameters<typeof syncMentorActivation>[0], seeded.userId);

  assert.equal(await storedStatus(current, seeded.userId), "PENDING", "the ordinary path still writes");
});
