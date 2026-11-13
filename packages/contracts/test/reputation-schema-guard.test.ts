/**
 * FR-REP-05 as a schema guard: no score-shaped name reaches the impact payload,
 * the reputation schema or the outcomes schema. Static on purpose, so a name
 * fails the build before a migration exists (design R3, R4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse } from "yaml";

const contractPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
const reputationSchemaPath = fileURLToPath(
  new URL("../../../services/api/src/db/schema/reputation.ts", import.meta.url),
);
const outcomesSchemaPath = fileURLToPath(
  new URL("../../../services/api/src/db/schema/outcomes.ts", import.meta.url),
);

/** The forbidden families, one word each (design R3). */
const FORBIDDEN = [
  "score",
  "point",
  "rank",
  "tier",
  "like",
  "star",
  "follower",
  "rating",
  "percent",
  "rate",
  "average",
  "aggregate",
] as const;

/**
 * The two names that exist today and are allowed to, with the reason. Anything
 * else fails the build and needs an entry here plus a reviewer's agreement.
 */
const ALLOWLIST: Record<string, string> = {
  // the outcome's evidence tier (FR-OUT-07); a documented domain input, inert
  // at Tier 0 because evidence upload is not built (DEBT-22)
  evidence_tier: "tier",
  // the multiplier applied to one ledger event, internal only (DEBT-24)
  tier_multiplier: "tier",
  // one ledger event's amount, internal only (DEBT-24)
  points: "point",
  // the snapshot total, internal only and never sent by any route (DEBT-24)
  points_total: "point",
};

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** The family a name belongs to, or `null` when it belongs to none. */
export function forbiddenFamily(name: string): string | null {
  for (const word of words(name)) {
    for (const family of FORBIDDEN) {
      if (word === family || word === `${family}s` || word === `${family}es`) {
        return family;
      }
    }
  }
  return null;
}

/** Every key of a parsed YAML document, at every depth. */
function yamlNames(document: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        found.push(key);
        visit(value);
      }
    }
  };
  visit(document);
  return found;
}

/**
 * Every column name in a Drizzle schema file: the first argument of a column
 * builder. A check or index name is not a column, so it is not scanned.
 */
const COLUMN_BUILDER =
  /(?:uuid|text|varchar|boolean|integer|smallint|bigint|numeric|timestamp|date|jsonb|real|doublePrecision|serial|interval|time)\("([a-z][a-z0-9_]{2,})"/g;

function schemaNames(source: string): string[] {
  return [...source.matchAll(COLUMN_BUILDER)].map((match) => match[1]);
}

function offenders(names: readonly string[]): string[] {
  return [...new Set(names)]
    .filter((name) => forbiddenFamily(name) !== null && !(name in ALLOWLIST))
    .sort();
}

test("no score-shaped property or column reaches the impact payload", () => {
  const contract = yamlNames(parse(readFileSync(contractPath, "utf8")));
  const reputation = schemaNames(readFileSync(reputationSchemaPath, "utf8"));
  const outcomes = schemaNames(readFileSync(outcomesSchemaPath, "utf8"));
  assert.ok(contract.length > 100, `contract keys read: ${contract.length}`);
  assert.ok(reputation.length > 5, `reputation columns read: ${reputation.length}`);
  assert.ok(outcomes.length > 5, `outcomes columns read: ${outcomes.length}`);

  const found = offenders([...contract, ...reputation, ...outcomes]);
  assert.deepEqual(found, [], `forbidden names: ${found.join(", ")}`);
});

test("the allowlist carries a reason for every entry", () => {
  for (const [name, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(reason.trim().length > 0, `${name} has no reason`);
  }
});

test("the extractor is not vacuous: a fixture with score and follower_count reports both", () => {
  const fixture = 'text("score"), integer("follower_count"), text("title")';
  const names = schemaNames(fixture);
  assert.ok(names.includes("score"), `extracted: ${names.join(", ")}`);
  assert.ok(names.includes("follower_count"), `extracted: ${names.join(", ")}`);
  const found = offenders(names);
  assert.deepEqual(found.sort(), ["follower_count", "score"]);
});

test("the YAML walk is not vacuous: a nested fixture is reported", () => {
  const names = yamlNames(parse("components:\n  schemas:\n    Impact:\n      properties:\n        rating:\n          type: number\n"));
  assert.ok(names.includes("rating"), `extracted: ${names.join(", ")}`);
});
