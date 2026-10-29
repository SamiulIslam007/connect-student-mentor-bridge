import assert from "node:assert/strict";
import { test } from "node:test";

import { describeDomain, DOMAIN_PACKAGE_NAME } from "../src/index.js";

test("the domain package exposes its placeholder", () => {
  assert.equal(DOMAIN_PACKAGE_NAME, "@connect/domain");
  assert.match(describeDomain(), /pure business rules/);
});
