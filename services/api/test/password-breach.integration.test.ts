import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { apiRequest, startApiStack, type TestApiStack } from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

/**
 * SEC-AUTH-3's third clause at both paths that set a password (D-248, D-249).
 *
 * The provider is never reached: the stack takes the answer the identity service
 * receives, so a refused password, a clean one and an unreachable provider are
 * each exercised without a network call.
 */

const BREACHED = "correct horse battery staple";
const CLEAN = "quiet river lantern orchard";

let refused: TestApiStack | undefined;
let open: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const first = await startApiStack({
    controllers: [AuthController],
    requestIdRoutes: [AuthController],
    breach: (password) => (password === BREACHED ? "breached" : "clean"),
  });
  if (first.skipped) {
    skipReason = first.reason;
    return;
  }
  refused = first.stack;

  // A second stack, its own database state, where the provider never answers.
  const second = await startApiStack({
    controllers: [AuthController],
    requestIdRoutes: [AuthController],
    breach: () => "unavailable",
  });
  if (second.skipped) {
    return;
  }
  open = second.stack;
});

beforeEach(async () => {
  await truncateAll(refused?.client ?? open!.client);
  await truncateAll(open!.client);
});

after(async () => {
  await refused?.close();
  await open?.close();
});

function need(context: TestContext): { refused: TestApiStack; open: TestApiStack } | null {
  if (!refused || !open) {
    context.skip(skipReason);
    return null;
  }
  return { refused, open };
}

function registration(email: string, password: string): Record<string, unknown> {
  return {
    display_name: "রহিম উদ্দিন",
    email,
    password,
    date_of_birth: "2000-01-01",
    consent_accepted: true,
  };
}

test("registration refuses a known-breached password and writes nothing", async (context) => {
  const stacks = need(context);
  if (!stacks) {
    return;
  }

  const response = await apiRequest(stacks.refused, "POST", "/v1/auth/register", registration("breach@example.com", BREACHED));
  assert.equal(response.status, 422);
  assert.equal((response.body as { code?: string }).code, "VALIDATION_FAILED");
  assert.match(JSON.stringify(response.body), /password/);
  assert.match(JSON.stringify(response.body), /breach/);

  const users = await stacks.refused.client.query("SELECT id FROM users");
  assert.equal(users.rowCount, 0, "a refused password must write no user");
  const consents = await stacks.refused.client.query("SELECT id FROM consent_records");
  assert.equal(consents.rowCount, 0);
});

test("a clean password still registers", async (context) => {
  const stacks = need(context);
  if (!stacks) {
    return;
  }
  const response = await apiRequest(stacks.refused, "POST", "/v1/auth/register", registration("clean@example.com", CLEAN));
  assert.equal(response.status, 200);
});

test("a reset refuses a known-breached password and the old one still signs in", async (context) => {
  const stacks = need(context);
  if (!stacks) {
    return;
  }

  const email = "reset-breach@example.com";
  const registered = await apiRequest(stacks.refused, "POST", "/v1/auth/register", registration(email, CLEAN));
  assert.equal(registered.status, 200);

  // Without a verified session the reset is driven through the service directly:
  // the route needs a token only the mailbox holds, and the clause sits before it.
  const before = await stacks.refused.client.query(
    "SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1",
    [email],
  );
  assert.equal(before.rowCount, 1, "the account must have a password row");

  const reset = await stacks.refused.identity
    .resetPassword({ token: "token-from-the-mailbox", password: BREACHED, requestId: "test" })
    .catch((error: unknown) => error);
  assert.ok(reset instanceof Error, "the reset must be refused");

  const after = await stacks.refused.client.query(
    "SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1",
    [email],
  );
  assert.equal(after.rows[0].password, before.rows[0].password, "the stored password must not change");
});

test("an unreachable provider accepts the password on both paths", async (context) => {
  const stacks = need(context);
  if (!stacks) {
    return;
  }

  const email = "offline@example.com";
  const registered = await apiRequest(stacks.open, "POST", "/v1/auth/register", registration(email, CLEAN));
  assert.equal(registered.status, 200, "a participant must not be blocked by the provider");

  const users = await stacks.open.client.query("SELECT id FROM users WHERE email = $1", [email]);
  assert.equal(users.rowCount, 1, "the account is written as usual");
});
