import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuthController } from "../src/identity/auth.controller.js";
import { apiRequest, startApiStack, type TestApiStack } from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

/**
 * The API's own honeypot (SEC-ABUSE-1, D-221): a direct call to
 * `POST /v1/auth/register` with a filled `contact_website` is refused exactly as
 * the BFF refuses it, and the refusal writes no user, consent or audit row.
 * Timing lives in the BFF only, because the API is bearer-only and parses no
 * session cookie (design R5).
 */

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

before(async () => {
  const started = await startApiStack({
    controllers: [AuthController],
    requestIdRoutes: [AuthController],
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

beforeEach(async () => {
  if (stack) {
    await truncateAll(stack.client);
  }
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

function registration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    display_name: "Student",
    email: "student@example.com",
    password: "a sufficiently long passphrase",
    date_of_birth: "2000-01-01",
    consent_accepted: true,
    ...overrides,
  };
}

test("a filled honeypot is refused with the generic code and writes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  const refused = await apiRequest(
    current,
    "POST",
    "/v1/auth/register",
    registration({ contact_website: "https://spam.example" }),
  );

  assert.equal(refused.status, 422, refused.text);
  assert.equal(refused.body?.code, "REGISTRATION_REFUSED");
  assert.equal(
    refused.body?.detail,
    "This submission could not be processed. Reload the page and try again.",
  );

  const counts = await current.client.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM users)::text AS users,
            (SELECT count(*) FROM consent_records)::text AS consent_records,
            (SELECT count(*) FROM audit_logs)::text AS audit_logs,
            (SELECT count(*) FROM signup_blocks)::text AS signup_blocks`,
  );
  assert.deepEqual(counts.rows[0], {
    users: "0",
    consent_records: "0",
    audit_logs: "0",
    signup_blocks: "0",
  });
  assert.equal((await current.sender.messages.length), 0, "no verification email is queued");
});

test("an empty or whitespace honeypot registers exactly as before", async (context) => {
  const current = requireStack(context);
  if (!current) return;

  for (const value of ["", "   ", undefined]) {
    const accepted = await apiRequest(
      current,
      "POST",
      "/v1/auth/register",
      registration({ contact_website: value, email: `student-${String(value).length}-${Math.random()}@example.com` }),
    );
    assert.equal(accepted.status, 200, `${String(value)}: ${accepted.text}`);
  }

  const users = await current.client.query("SELECT id FROM users");
  assert.equal(users.rowCount, 3);
});
