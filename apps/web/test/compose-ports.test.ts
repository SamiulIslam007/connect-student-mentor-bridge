import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * SEC-AUDIT-017 (D-261): every published port binds to loopback. Mailpit shows a
 * verification token to any LAN peer when 0.0.0.0 is the default.
 */
const COMPOSE = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "compose.yaml"), "utf8");

function publishedPorts(text: string): string[] {
  const values: string[] = [];
  const lines = text.split(/\r?\n/);
  let inPorts = false;
  let indent = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const leading = line.length - line.trimStart().length;
    if (/^ports:\s*$/.test(trimmed)) {
      inPorts = true;
      indent = leading;
      continue;
    }
    if (!inPorts) {
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    if (leading <= indent) {
      inPorts = false;
      continue;
    }
    const match = /^-\s*"([^"]+)"$/.exec(trimmed);
    if (match) {
      values.push(match[1]);
    }
  }
  return values;
}

test("every published compose port binds to 127.0.0.1", () => {
  const ports = publishedPorts(COMPOSE);
  assert.ok(ports.length >= 6, `expected the six published ports, found ${ports.length}`);
  for (const published of ports) {
    assert.match(published, /^127\.0\.0\.1:/, `${published} must bind to loopback`);
    assert.equal(published.startsWith("0.0.0.0:"), false, `${published} exposes the stack to the LAN`);
  }
});

test("no service publishes a port on a bare host or all interfaces", () => {
  for (const published of publishedPorts(COMPOSE)) {
    assert.equal(/^(\d+:)?\d+$/.test(published.split(":").slice(-1)[0] ?? ""), true);
    assert.equal(published.startsWith(":"), false, `${published} has no host address`);
  }
  // A LAN override is opt-in in documentation only; the file itself stays loopback.
  assert.equal(/0\.0\.0\.0:\$\{/.test(COMPOSE), false);
});
