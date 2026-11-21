import assert from "node:assert/strict";
import { test } from "node:test";

import { BLOCKING_SEVERITIES, formatViolation, type Violation } from "../support/axe";

const sample = (impact: string): Violation => ({
  surface: "/sign-up",
  id: "label",
  impact,
  help: "Form elements must have labels",
  elements: ["#email"],
});

test("serious and critical block; moderate and minor do not", () => {
  assert.deepEqual(BLOCKING_SEVERITIES, ["critical", "serious"]);
  const blocking = (violations: Violation[]): boolean =>
    violations.some((violation) =>
      BLOCKING_SEVERITIES.includes(violation.impact as "critical" | "serious"),
    );
  assert.equal(blocking([sample("critical")]), true);
  assert.equal(blocking([sample("serious")]), true);
  assert.equal(blocking([sample("moderate")]), false);
  assert.equal(blocking([sample("minor")]), false);
  assert.equal(blocking([sample("moderate"), sample("serious")]), true);
});

test("a violation is formatted with its surface, rule and element", () => {
  const line = formatViolation(sample("serious"));
  assert.match(line, /^\/sign-up \[serious\] label: Form elements must have labels -> #email$/);
});
