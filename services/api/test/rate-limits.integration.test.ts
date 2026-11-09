import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";

import { DATABASE_PROBE, HealthController, defaultProbe } from "../src/health/health.controller.js";
import { AuthController } from "../src/identity/auth.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  type TestApiStack,
} from "./support/api-stack.js";

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: [AuthController, HealthController],
    requestIdRoutes: [AuthController, HealthController],
    providers: () => [{ provide: DATABASE_PROBE, useValue: defaultProbe }],
    throttle: true,
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

after(async () => {
  await stack?.close();
});

function requireStack(context: TestContext): TestApiStack | null {
  if (!stack) {
    context.skip(skipReason);
    return null;
  }
  return stack;
}

test("the sixth sign-in inside a minute is 429 with Retry-After", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await registerAndVerify(current, "throttle@example.com");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const allowed = await signIn(current, "throttle@example.com");
    assert.equal(allowed.status, 200, `attempt ${attempt}: ${allowed.text}`);
  }

  const refused = await signIn(current, "throttle@example.com");
  assert.equal(refused.status, 429, refused.text);
  assert.equal(refused.body?.code, "RATE_LIMITED");
  assert.ok(Number(refused.headers.get("retry-after")) > 0, "Retry-After must be numeric");
});

test("a throttled route does not block another route or an operational probe", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await registerAndVerify(current, "throttle-other@example.com");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await signIn(current, "throttle-other@example.com");
  }
  const throttled = await signIn(current, "throttle-other@example.com");
  assert.equal(throttled.status, 429);

  const forgot = await apiRequest(current, "POST", "/v1/auth/forgot-password", {
    email: "throttle-other@example.com",
  });
  assert.equal(forgot.status, 200, "each route has its own bucket");

  for (let probe = 0; probe < 5; probe += 1) {
    const health = await apiRequest(current, "GET", "/healthz");
    assert.equal(health.status, 200, "the operational probes are never throttled");
  }
});
