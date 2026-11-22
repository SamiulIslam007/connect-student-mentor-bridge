import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * SEC-AUDIT-025 (D-262): the three install-time policy settings live in `.npmrc`,
 * so a fresh `pnpm install` is not the first time anyone learns about them.
 */
const NPMRC = readFileSync(path.join(import.meta.dirname, "..", "..", "..", ".npmrc"), "utf8")
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

function setting(name: string): string | undefined {
  const match = new RegExp(`^\\s*${name}\\s*=\\s*(\\S+)\\s*$`, "m").exec(NPMRC);
  return match?.[1];
}

test("a release must be a week old before it can be resolved", () => {
  assert.equal(setting("minimumReleaseAge"), "10080", "10080 minutes is seven days");
});

test("a subdependency may not resolve through an exotic mechanism", () => {
  assert.equal(setting("blockExoticSubdeps"), "true");
});

test("a package whose trust evidence weakened is refused, with a named exclusion list", () => {
  assert.equal(setting("trustPolicy"), "no-downgrade");
  const excluded = setting("trustPolicyExclude");
  if (excluded !== undefined) {
    // An exclusion is a documented exception, never a wildcard.
    assert.equal(excluded.includes("*"), false, `trustPolicyExclude is too broad: ${excluded}`);
  }
});
