import assert from "node:assert/strict";
import { test } from "node:test";

import { API_SERVICE_NAME } from "@connect/config";
import { DOMAIN_PACKAGE_NAME } from "@connect/domain";

test("shared workspace packages resolve from the API", () => {
  assert.equal(API_SERVICE_NAME, "api");
  assert.equal(DOMAIN_PACKAGE_NAME, "@connect/domain");
});
