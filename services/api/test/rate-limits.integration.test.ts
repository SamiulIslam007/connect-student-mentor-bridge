import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test, type TestContext } from "node:test";

import { DATABASE_PROBE, HealthController, defaultProbe } from "../src/health/health.controller.js";
import { AuthController } from "../src/identity/auth.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  TEST_PASSWORD,
  type TestApiStack,
} from "./support/api-stack.js";

const BFF_TRUST_SECRET = "test-bff-secret";
process.env.BFF_TRUST_SECRET = BFF_TRUST_SECRET;

/** The signed client identity the BFF would forward for one browser. */
function signed(clientKey: string): Record<string, string> {
  return {
    "x-connect-client-key": clientKey,
    "x-connect-client-signature": createHmac("sha256", BFF_TRUST_SECRET)
      .update(clientKey)
      .digest("hex"),
  };
}

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

  // More probes than the account bucket allows per minute: the named skip has
  // to cover both throttlers, not only the default one (design R1, D-118).
  for (let probe = 0; probe < 130; probe += 1) {
    const health = await apiRequest(current, "GET", "/healthz");
    assert.equal(health.status, 200, "the operational probes are never throttled");
  }
});

/** The address bucket allows five sign-ins a minute, so the hourly account
 * bucket can only be reached by waiting out the minute between batches. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("the account bucket, not the address bucket, refuses the eleventh sign-in", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await registerAndVerify(current, "account-bucket@example.com");

  // A clean address window first, so earlier tests cannot influence this one.
  await sleep(61_000);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const allowed = await signIn(current, "account-bucket@example.com");
    assert.equal(allowed.status, 200, `attempt ${attempt}: ${allowed.text}`);
  }

  await sleep(61_000);
  for (let attempt = 6; attempt <= 10; attempt += 1) {
    const allowed = await signIn(current, "account-bucket@example.com");
    assert.equal(allowed.status, 200, `attempt ${attempt}: ${allowed.text}`);
  }

  await sleep(61_000);
  const refused = await signIn(current, "account-bucket@example.com");
  assert.equal(refused.status, 429, refused.text);
  assert.equal(refused.body?.code, "RATE_LIMITED");
  assert.ok(
    Number(refused.headers.get("retry-after")) > 60,
    "the wait names the hourly account bucket, not the minute address bucket",
  );

  // A different account is still served. It is one the earlier test registered,
  // because the register route allows only three accounts an hour per address.
  const other = await signIn(current, "throttle-other@example.com");
  assert.equal(other.status, 200, "a different account is served in the same window");
});

test("an unsigned forwarding header cannot choose a bucket", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  // Clear the shared address window left by the earlier tests.
  await sleep(61_000);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const refused = await apiRequest(
      current,
      "POST",
      "/v1/auth/sign-in",
      { email: `spoof-${attempt}@example.com`, password: "wrong password" },
      undefined,
      { "x-connect-client-key": `spoof-${attempt}`, "x-connect-client-signature": "not-a-signature", cookie: `connect_session=random-${attempt}` },
    );
    assert.equal(refused.status, 401, `attempt ${attempt}: ${refused.text}`);
  }

  const limited = await apiRequest(
    current,
    "POST",
    "/v1/auth/sign-in",
    { email: "spoof-6@example.com", password: "wrong password" },
    undefined,
    { "x-connect-client-key": "spoof-6", "x-connect-client-signature": "not-a-signature", cookie: "connect_session=random-6" },
  );
  assert.equal(limited.status, 429, "the unsigned header selected no new bucket");
  assert.equal(limited.body?.code, "RATE_LIMITED");
});

test("a signed client key gives each browser its own sign-in bucket", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const refused = await apiRequest(
      current,
      "POST",
      "/v1/auth/sign-in",
      { email: `client-a-${attempt}@example.com`, password: "wrong password" },
      undefined,
      signed("203.0.113.10"),
    );
    assert.equal(refused.status, 401, `attempt ${attempt}: ${refused.text}`);
  }

  const limited = await apiRequest(
    current,
    "POST",
    "/v1/auth/sign-in",
    { email: "client-a-6@example.com", password: "wrong password" },
    undefined,
    signed("203.0.113.10"),
  );
  assert.equal(limited.status, 429, "the fifth attempt in the minute is the last");

  const other = await apiRequest(
    current,
    "POST",
    "/v1/auth/sign-in",
    { email: "client-b-1@example.com", password: "wrong password" },
    undefined,
    signed("203.0.113.11"),
  );
  assert.equal(other.status, 401, "a different browser is not collapsed into the same bucket");
});

test("one source cannot lock a victim's correct credential from another source", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  await registerAndVerify(current, "lockout-victim@example.com", signed("198.51.100.50"));

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const refused = await apiRequest(
      current,
      "POST",
      "/v1/auth/sign-in",
      { email: "lockout-victim@example.com", password: "wrong password" },
      undefined,
      signed("203.0.113.20"),
    );
    assert.equal(refused.status, 401, `attempt ${attempt}: ${refused.text}`);
  }

  await sleep(61_000);

  for (let attempt = 6; attempt <= 10; attempt += 1) {
    const refused = await apiRequest(
      current,
      "POST",
      "/v1/auth/sign-in",
      { email: "lockout-victim@example.com", password: "wrong password" },
      undefined,
      signed("203.0.113.20"),
    );
    assert.equal(refused.status, 401, `attempt ${attempt}: ${refused.text}`);
  }

  const blocked = await apiRequest(
    current,
    "POST",
    "/v1/auth/sign-in",
    { email: "lockout-victim@example.com", password: "wrong password" },
    undefined,
    signed("203.0.113.20"),
  );
  assert.equal(blocked.status, 429, "the attacker's own source stays limited");

  const victim = await apiRequest(
    current,
    "POST",
    "/v1/auth/sign-in",
    { email: "lockout-victim@example.com", password: TEST_PASSWORD },
    undefined,
    signed("198.51.100.50"),
  );
  assert.equal(victim.status, 200, "the victim's correct credential from another source is admitted");
});

test("five reset requests from one source do not block another source", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const accepted = await apiRequest(
      current,
      "POST",
      "/v1/auth/forgot-password",
      { email: "lockout-victim@example.com" },
      undefined,
      signed("203.0.113.30"),
    );
    assert.equal(accepted.status, 200, `attempt ${attempt}: ${accepted.text}`);
  }

  const limited = await apiRequest(
    current,
    "POST",
    "/v1/auth/forgot-password",
    { email: "lockout-victim@example.com" },
    undefined,
    signed("203.0.113.30"),
  );
  assert.equal(limited.status, 429, "the reset bucket is per source");

  const other = await apiRequest(
    current,
    "POST",
    "/v1/auth/forgot-password",
    { email: "lockout-victim@example.com" },
    undefined,
    signed("198.51.100.50"),
  );
  assert.equal(other.status, 200, "another source can still request a reset");
});
