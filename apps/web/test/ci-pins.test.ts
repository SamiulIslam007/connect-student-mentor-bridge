import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * SEC-AUDIT-026 (D-262): a tag is a mutable pointer, so every action is pinned to
 * a full commit SHA with the tag beside it for a reader.
 */
const WORKFLOW = readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);

const SHA = /^[a-f0-9]{40}$/;

export interface PinProblem {
  line: string;
  problem: "no-ref" | "tag-not-sha" | "missing-version-comment";
}

/** Every `uses:` line, with what is wrong with it. Empty means every one is pinned. */
export function pinProblems(yaml: string): PinProblem[] {
  const problems: PinProblem[] = [];
  for (const raw of yaml.split(/\r?\n/)) {
    const match = /^\s*-?\s*uses:\s*(\S+)(.*)$/.exec(raw);
    if (!match) {
      continue;
    }
    const spec = match[1];
    const rest = match[2] ?? "";
    const at = spec.lastIndexOf("@");
    if (at === -1) {
      problems.push({ line: raw.trim(), problem: "no-ref" });
      continue;
    }
    const ref = spec.slice(at + 1);
    if (!SHA.test(ref)) {
      problems.push({ line: raw.trim(), problem: "tag-not-sha" });
      continue;
    }
    if (!/#\s*v?\d/.test(rest)) {
      problems.push({ line: raw.trim(), problem: "missing-version-comment" });
    }
  }
  return problems;
}

test("every uses: is a full commit SHA with the version beside it", () => {
  assert.deepEqual(pinProblems(WORKFLOW), []);
  const uses = WORKFLOW.split(/\r?\n/).filter((line) => /^\s*-?\s*uses:/.test(line));
  assert.ok(uses.length >= 8, `expected the eight pinned actions, found ${uses.length}`);
});

test("the checker fails a tag, a branch and a missing comment", () => {
  assert.deepEqual(pinProblems("      - uses: actions/checkout@v4"), [
    { line: "- uses: actions/checkout@v4", problem: "tag-not-sha" },
  ]);
  assert.deepEqual(pinProblems("      - uses: actions/checkout@main"), [
    { line: "- uses: actions/checkout@main", problem: "tag-not-sha" },
  ]);
  assert.deepEqual(pinProblems("      - uses: actions/checkout"), [
    { line: "- uses: actions/checkout", problem: "no-ref" },
  ]);
  assert.deepEqual(
    pinProblems(`      - uses: actions/checkout@${"a".repeat(40)}`),
    [{ line: `- uses: actions/checkout@${"a".repeat(40)}`, problem: "missing-version-comment" }],
  );
  assert.deepEqual(pinProblems(`      - uses: actions/checkout@${"a".repeat(40)} # v4`), []);
});

test("a checkout never leaves the token in .git/config", () => {
  const lines = WORKFLOW.split(/\r?\n/);
  const checkouts = lines.filter((line) => /uses:\s*actions\/checkout@/.test(line));
  assert.ok(checkouts.length >= 4, `every job checks out, found ${checkouts.length}`);
  for (const [index, line] of lines.entries()) {
    if (!/uses:\s*actions\/checkout@/.test(line)) {
      continue;
    }
    const window = lines.slice(index, index + 5).join("\n");
    assert.match(window, /persist-credentials:\s*false/, `checkout at line ${index + 1} keeps the token`);
  }
});
