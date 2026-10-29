import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "../app/healthz/route.js";

test("the web health route answers 200 with a static body", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { status: "ok", service: "web" });
});
