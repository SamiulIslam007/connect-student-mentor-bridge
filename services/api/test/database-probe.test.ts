import assert from "node:assert/strict";
import { test } from "node:test";

import { probeDatabase } from "../src/health/database-probe.js";

test("a reachable database reports ok", async () => {
  const status = await probeDatabase(undefined, { query: async () => ({ rows: [1] }) });

  assert.equal(status, "ok");
});

test("a failing database reports unavailable and logs the error internally", async () => {
  const logged: string[] = [];
  const status = await probeDatabase("postgresql://user:secret-value@db:5432/connect", {
    query: async () => {
      throw new Error("connect ECONNREFUSED postgresql://user:secret-value@db:5432/connect");
    },
    log: (message) => logged.push(message),
  });

  assert.equal(status, "unavailable");
  assert.deepEqual(logged, ["database readiness probe failed"]);
});

test("a hanging check is bounded by the timeout", async () => {
  const startedAt = Date.now();
  const status = await probeDatabase(undefined, {
    query: () => new Promise(() => undefined),
    timeoutMs: 25,
    log: () => undefined,
  });

  assert.equal(status, "unavailable");
  assert.ok(Date.now() - startedAt < 1_000, "the probe must not wait indefinitely");
});

test("a missing connection string reports unavailable without querying", async () => {
  const status = await probeDatabase(undefined, { log: () => undefined });

  assert.equal(status, "unavailable");
});
