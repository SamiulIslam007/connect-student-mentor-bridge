import assert from "node:assert/strict";
import { test } from "node:test";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { DATABASE_PROBE, HealthController } from "../src/health/health.controller.js";
import type { DatabaseProbe } from "../src/health/database-probe.js";

async function startApi(probe: DatabaseProbe): Promise<INestApplication> {
  @Module({
    controllers: [HealthController],
    providers: [{ provide: DATABASE_PROBE, useValue: probe }],
  })
  class HealthTestModule {}

  const app = await NestFactory.create(HealthTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  return app;
}

test("the operational endpoints answer without credentials", async () => {
  const app = await startApi(async () => "ok");
  try {
    const baseUrl = await app.getUrl();

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(await health.json(), { status: "ok", service: "api" });

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ok", checks: { database: "ok" } });

    const unknown = await fetch(`${baseUrl}/health`);
    assert.equal(unknown.status, 404);
  } finally {
    await app.close();
  }
});

test("readiness is 503 when the database is unavailable and leaks no internal detail", async () => {
  const app = await startApi(async () => "unavailable");
  try {
    const baseUrl = await app.getUrl();

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 503);

    const body = await ready.text();
    assert.deepEqual(JSON.parse(body), {
      status: "unavailable",
      checks: { database: "unavailable" },
    });
    assert.ok(!body.includes("postgresql://"), "no connection string in the body");
    assert.ok(!body.toLowerCase().includes("stack"), "no stack trace in the body");
  } finally {
    await app.close();
  }
});
