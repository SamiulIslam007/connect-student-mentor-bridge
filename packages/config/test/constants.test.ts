import assert from "node:assert/strict";
import { test } from "node:test";

import { API_SERVICE_NAME, APP_NAME, READINESS_TIMEOUT_MS } from "../src/index.js";

test("shared constants are stable", () => {
  assert.equal(APP_NAME, "connect");
  assert.equal(API_SERVICE_NAME, "api");
  assert.equal(READINESS_TIMEOUT_MS, 2_000);
});
