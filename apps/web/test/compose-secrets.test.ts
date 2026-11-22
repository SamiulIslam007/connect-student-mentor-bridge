import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * SEC-AUDIT-018 (D-261): the web container is not the provider owner. An API-only
 * secret in its block is a second place to leak it from.
 */
const COMPOSE_RAW = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "compose.yaml"), "utf8");
const COMPOSE = COMPOSE_RAW.replace(/\r\n/g, "\n");

function serviceBlock(name: string): string {
  const start = COMPOSE.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `${name} service exists`);
  const rest = COMPOSE.slice(start + 1);
  // The block runs to the next two-space service key at column 2.
  const next = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const API_ONLY = [
  "GOOGLE_CLIENT_SECRET",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "S3_SECRET_ACCESS_KEY",
  "S3_ACCESS_KEY_ID",
  "SMTP_PASSWORD",
  "CLAMAV_HOST",
  "POSTGRES_PASSWORD",
];

test("the web service carries no API-only secret name", () => {
  const web = serviceBlock("web");
  assert.ok(web.includes("API_INTERNAL_URL"), "the web block is the one under test");
  for (const name of API_ONLY) {
    assert.equal(web.includes(name), false, `web must not receive ${name}`);
  }
});

test("the web keeps the two secrets it actually needs, and no literal value", () => {
  const web = serviceBlock("web");
  assert.ok(web.includes("BFF_TRUST_SECRET"), "it signs the forwarded client key");
  assert.equal(web.includes("GOOGLE_CLIENT_ID"), false, "the provider belongs to the API");
  // Every value is an interpolation or a documented constant, never a credential.
  for (const line of web.split(/\r?\n/)) {
    const match = /^\s+([A-Z0-9_]+):\s*(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const value = match[2].trim();
    assert.equal(
      /^(local-dev-only|password|changeme)$/i.test(value),
      false,
      `${match[1]} carries a literal placeholder value`,
    );
  }
});
