import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";

import { createDatabaseConnection, type DatabaseConnection } from "../src/db/database.js";
import { seedAffiliationAttestations } from "../src/db/seed/affiliations.js";
import { INSTITUTION_SEED, seedInstitutions, type InstitutionSeed } from "../src/db/seed/institutions.js";
import { openTestDatabase, resetDatabase, testDatabaseUrl, truncateAll, type TestDatabase } from "./support/database.js";

const FIXTURE: readonly InstitutionSeed[] = [
  {
    name: "Fixture University",
    kind: "UNIVERSITY",
    countryCode: "BD",
    domains: ["fixture.example", "second.fixture.example"],
  },
  {
    name: "Fixture Institute",
    kind: "BOOTCAMP",
    countryCode: "BD",
    domains: ["bootcamp.example"],
  },
];

let database: TestDatabase | undefined;
let connection: DatabaseConnection | undefined;

before(async () => {
  database = await openTestDatabase();
  if (database.skipped) {
    return;
  }
  await resetDatabase(database.client);
  connection = createDatabaseConnection(testDatabaseUrl());
});

after(async () => {
  await connection?.pool.end();
  if (database && !database.skipped) {
    await database.client.end();
  }
});

function requireConnection(context: TestContext): DatabaseConnection | null {
  if (!connection || !database || database.skipped) {
    context.skip(database?.reason ?? "connect_test is not reachable");
    return null;
  }
  return connection;
}

test("the seed is idempotent and a second run inserts nothing", async (context) => {
  const stack = requireConnection(context);
  if (!stack) {
    return;
  }
  await truncateAll(database!.client);
  await database!.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");

  const first = await seedInstitutions(stack.db, FIXTURE);
  assert.equal(first.inserted.institutions, 2);
  assert.equal(first.inserted.domains, 3);
  assert.equal(first.institutions, 2);
  assert.equal(first.domains, 3);

  const second = await seedInstitutions(stack.db, FIXTURE);
  assert.deepEqual(second.inserted, { institutions: 0, domains: 0 });
  assert.equal(second.institutions, first.institutions);
  assert.equal(second.domains, first.domains);
});

test("the checked-in seed source is usable as written", async (context) => {
  const stack = requireConnection(context);
  if (!stack) {
    return;
  }

  const result = await seedInstitutions(stack.db, INSTITUTION_SEED);
  assert.ok(result.institutions >= INSTITUTION_SEED.length);
  const domains = await database!.client.query<{ domain: string }>(
    "SELECT domain FROM institution_domains ORDER BY domain",
  );
  for (const domain of domains.rows.map((row) => row.domain)) {
    assert.equal(domain, domain.toLowerCase(), "domains are stored lowercase");
    assert.match(
      domain,
      /\.example$|^example\.edu\.bd$/,
      "the checked-in seed uses reserved .example domains or the documented placeholder (D-57)",
    );
  }
});

test("a duplicate domain with different letter case fails loudly and writes nothing", async (context) => {
  const stack = requireConnection(context);
  if (!stack) {
    return;
  }

  await database!.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");

  const duplicateSource: readonly InstitutionSeed[] = [
    { name: "First", kind: "UNIVERSITY", countryCode: "BD", domains: ["duplicate.example"] },
    { name: "Second", kind: "BOOTCAMP", countryCode: "BD", domains: ["DUPLICATE.example"] },
  ];

  await assert.rejects(seedInstitutions(stack.db, duplicateSource), /duplicate institution domain/i);

  const institutions = await database!.client.query("SELECT id FROM institutions");
  assert.equal(institutions.rowCount, 0, "no partial rows after a rejected source");
});

test("a domain already owned by another institution rolls the whole run back", async (context) => {
  const stack = requireConnection(context);
  if (!stack) {
    return;
  }

  await database!.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");

  await seedInstitutions(stack.db, [
    { name: "Existing", kind: "UNIVERSITY", countryCode: "BD", domains: ["taken.example"] },
  ]);

  const conflicting: readonly InstitutionSeed[] = [
    { name: "New Institution", kind: "TRAINING_INSTITUTE", countryCode: "BD", domains: ["taken.example"] },
  ];

  await assert.rejects(seedInstitutions(stack.db, conflicting), /already registered|duplicate/i);

  const institutions = await database!.client.query<{ name: string }>("SELECT name FROM institutions ORDER BY name");
  assert.deepEqual(
    institutions.rows.map((row) => row.name),
    ["Existing"],
    "the conflicting institution was not created",
  );
});

test("the attestation seed grants Level 1 once and skips unknown accounts", async (context) => {
  const stack = requireConnection(context);
  if (!stack) {
    return;
  }
  await truncateAll(database!.client);
  await database!.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");
  await seedInstitutions(stack.db, FIXTURE);
  await database!.client.query(
    "INSERT INTO users (id, name, email) VALUES ('pilot-1', 'Pilot Mentor', 'pilot.mentor@fixture.example')",
  );

  const source = [
    {
      email: "pilot.mentor@fixture.example",
      institution: "Fixture University",
      kind: "ALUMNUS" as const,
      reason: "fixture attestation",
    },
    {
      email: "missing@fixture.example",
      institution: "Fixture University",
      kind: "STUDENT" as const,
      reason: "fixture attestation",
    },
  ];

  const first = await seedAffiliationAttestations(stack.db, source);
  assert.equal(first.granted, 1);
  assert.deepEqual(first.skipped, [{ email: "missing@fixture.example", reason: "no account" }]);

  const rows = await database!.client.query<{
    level: string;
    method: string;
    status: string;
    decision_reason: string;
  }>("SELECT level, method, status, decision_reason FROM affiliations");
  assert.deepEqual(rows.rows, [
    {
      level: "LEVEL_1",
      method: "ADMIN_ATTESTATION",
      status: "VERIFIED",
      decision_reason: "fixture attestation",
    },
  ]);
  const audit = await database!.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'AFFILIATION_GRANTED'",
  );
  assert.equal(audit.rows[0].count, "1");

  const second = await seedAffiliationAttestations(stack.db, source);
  assert.equal(second.granted, 0);
  assert.equal(second.skipped.length, 2);
  const count = await database!.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM affiliations",
  );
  assert.equal(count.rows[0].count, "1", "a rerun inserts nothing");
});
