import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Controller, Get, Module, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { DATABASE_PROBE, HealthController } from "../src/health/health.controller.js";
import { apiSecurityHeaders } from "../src/http/security-headers.js";

/** Two throws, so the header set is asserted on a 401 and a 422 as well as a 200. */
@Controller("v1/test")
class ThrowController {
  @Get("unauthorized")
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  @Get("invalid")
  invalid(): never {
    throw new UnprocessableEntityException();
  }
}

/**
 * The header set on a `200`, a `401` and a `422`, and the absence of a
 * cross-origin allow header (SEC-API-3 to SEC-API-5).
 */
async function startApi(): Promise<NestExpressApplication> {
  @Module({
    controllers: [HealthController, ThrowController],
    providers: [{ provide: DATABASE_PROBE, useValue: async () => "ok" }],
  })
  class HeaderTestModule {}

  const app = await NestFactory.create<NestExpressApplication>(HeaderTestModule, {
    bodyParser: false,
    logger: false,
  });
  app.use(apiSecurityHeaders);
  app.useBodyParser("json", { limit: 1024, strict: false });
  await app.listen(0, "127.0.0.1");
  return app;
}

for (const [label, path, expected] of [
  ["a 200", "/healthz", 200],
  ["a 401", "/v1/test/unauthorized", 401],
  ["a 422", "/v1/test/invalid", 422],
] as const) {
  test(`${label} carries the five security headers`, async () => {
    const app = await startApi();
    try {
      const baseUrl = await app.getUrl();
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { origin: "https://evil.example" },
      });
      assert.equal(response.status, expected, `${label} answered ${response.status}`);

      const policy = response.headers.get("content-security-policy");
      assert.ok(policy, `${label} carries a content-security-policy`);
      for (const directive of [
        "default-src 'none'",
        "script-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'none'",
      ]) {
        assert.ok(policy?.includes(directive), `${label} policy carries ${directive}`);
      }
      assert.ok(
        response.headers.get("strict-transport-security")?.includes("max-age=31536000"),
        `${label} carries strict-transport-security`,
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${label} nosniff`);
      assert.equal(response.headers.get("x-frame-options"), "DENY", `${label} frame protection`);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer", `${label} referrer policy`);
      assert.equal(response.headers.get("x-powered-by"), null, `${label} hides X-Powered-By`);
      assert.equal(
        response.headers.get("content-security-policy-report-only"),
        null,
        `${label} is enforcing, not report-only`,
      );
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        null,
        `${label} carries no cross-origin allow header`,
      );
    } finally {
      await app.close();
    }
  });
}

test("a preflight carries no allow header and no allow methods", async () => {
  const app = await startApi();
  try {
    const baseUrl = await app.getUrl();
    const response = await fetch(`${baseUrl}/healthz`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-methods"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  } finally {
    await app.close();
  }
});

/**
 * The behaviour above proves the module; this proves the app uses it. Without
 * it, deleting the `app.use` line in `main.ts` would leave every assertion green.
 */
test("the API bootstrap applies the header set before the body parser", () => {
  const main = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  assert.ok(main.includes("app.use(apiSecurityHeaders)"), "main.ts applies the header set");
  assert.ok(
    main.indexOf("app.use(apiSecurityHeaders)") < main.indexOf("useBodyParser"),
    "the headers are applied before the body parser, so a refused body carries them",
  );
  assert.ok(!main.includes("enableCors"), "no CORS allowlist is enabled");
});
