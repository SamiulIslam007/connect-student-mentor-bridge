import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { Module, type INestApplication, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { createEmailVerificationToken } from "better-auth/api";

import { createIdentityAuth } from "../src/identity/better-auth.js";
import { BetterAuthIdentityService } from "../src/identity/better-auth-identity.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { IDENTITY_SERVICE } from "../src/identity/identity.tokens.js";
import { createDatabaseConnection, type DatabaseConnection } from "../src/db/database.js";
import type { EmailMessage, EmailSender } from "../src/email/email-sender.js";
import { ProblemDetailsFilter } from "../src/http/problem-details.filter.js";
import { RequestIdMiddleware } from "../src/http/request-id.middleware.js";
import { openTestDatabase, resetDatabase, testDatabaseUrl, truncateAll, type TestDatabase } from "./support/database.js";

/** Test-only value: 32 identical characters, never used outside this file. */
const TEST_AUTH_SECRET = "x".repeat(32);
const APP_ORIGIN = "http://localhost:3000";
const PASSWORD = "a sufficiently long passphrase";

class RecordingEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  async last(template: EmailMessage["template"]): Promise<EmailMessage> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const found = [...this.messages].reverse().find((message) => message.template === template);
      if (found) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`no ${template} email was sent`);
  }

  reset(): void {
    this.messages.length = 0;
  }
}

let database: TestDatabase | undefined;
let connection: DatabaseConnection | undefined;
let app: INestApplication | undefined;
let baseUrl = "";
let sender: RecordingEmailSender | undefined;

before(async () => {
  database = await openTestDatabase();
  if (database.skipped) {
    return;
  }
  await resetDatabase(database.client);

  connection = createDatabaseConnection(testDatabaseUrl());
  sender = new RecordingEmailSender();

  const auth = createIdentityAuth({
    database: connection.db,
    emailSender: sender,
    secret: TEST_AUTH_SECRET,
    baseUrl: APP_ORIGIN,
  });
  const service = new BetterAuthIdentityService({
    auth,
    database: connection.db,
    secret: TEST_AUTH_SECRET,
  });

  @Module({
    controllers: [AuthController],
    providers: [{ provide: IDENTITY_SERVICE, useValue: service }],
  })
  class IdentityTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(AuthController);
    }
  }

  app = await NestFactory.create(IdentityTestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});

beforeEach(async () => {
  if (database && !database.skipped && database.client) {
    await truncateAll(database.client);
    sender?.reset();
  }
});

after(async () => {
  await app?.close();
  await connection?.pool.end();
  if (database && !database.skipped) {
    await database.client.end();
  }
});

function requireStack(
  context: TestContext,
): { client: TestDatabase["client"]; database: DatabaseConnection } | null {
  if (!database || database.skipped || !connection || !sender) {
    context.skip(database?.reason ?? "connect_test is not reachable");
    return null;
  }
  return { client: database.client, database: connection };
}

interface HttpResult {
  status: number;
  body: Record<string, unknown> | undefined;
  text: string;
}

async function request(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  sessionToken?: string,
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
    text,
  };
}

function tokenFromEmail(message: EmailMessage, pathFragment: string): string {
  const link = message.text.split("\n").find((line) => line.includes(pathFragment));
  assert.ok(link, `the email must contain ${pathFragment}`);
  const token = new URL(link).searchParams.get("token");
  assert.ok(token, "the link must carry a token");
  return token;
}

async function register(email: string, dateOfBirth = "2000-01-01"): Promise<HttpResult> {
  return request("POST", "/v1/auth/register", {
    display_name: "রহিম উদ্দিন",
    email,
    password: PASSWORD,
    date_of_birth: dateOfBirth,
  });
}

async function signIn(email: string, password = PASSWORD): Promise<HttpResult> {
  return request("POST", "/v1/auth/sign-in", { email, password });
}

test("registration writes one account, two consent rows, an audit entry, and sends the email", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(sender);

  const response = await register("student@example.com");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "verification_sent" });

  const users = await client.query(
    "SELECT id, name, email, email_verified, status, age_18_plus, age_gate_passed_at, age_gate_version, timezone FROM users",
  );
  assert.equal(users.rowCount, 1);
  const user = users.rows[0];
  assert.equal(user.name, "রহিম উদ্দিন");
  assert.equal(user.email, "student@example.com");
  assert.equal(user.email_verified, false);
  assert.equal(user.status, "PENDING");
  assert.equal(user.age_18_plus, true);
  assert.ok(user.age_gate_passed_at instanceof Date);
  assert.equal(user.age_gate_version, "age-gate-2026-11");
  assert.equal(user.timezone, "Asia/Dhaka");

  const consent = await client.query(
    "SELECT purpose, action, document_version FROM consent_records WHERE user_id = $1 ORDER BY purpose",
    [user.id],
  );
  assert.equal(consent.rowCount, 2);
  assert.deepEqual(
    consent.rows.map((row) => row.purpose),
    ["TERMS", "PRIVACY_NOTICE"],
  );
  assert.ok(consent.rows.every((row) => row.action === "GRANTED"));
  assert.ok(consent.rows.every((row) => row.document_version === "2026-11"));

  const audit = await client.query("SELECT action FROM audit_logs WHERE actor_user_id = $1", [user.id]);
  assert.deepEqual(
    audit.rows.map((row) => row.action),
    ["USER_REGISTERED"],
  );

  const email = await sender.last("verify-email");
  assert.equal(email.to, "student@example.com");
  assert.match(email.text, /token=/);

  // No table stores a date of birth (FR-AUTH-03).
  const columns = await client.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const birthColumns = columns.rows.filter((column) => /birth|dob/i.test(column.column_name));
  assert.deepEqual(birthColumns, []);
});

test("a duplicate email creates no second account and reveals nothing", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  assert.equal((await register("repeat@example.com")).status, 200);
  sender?.reset();
  const duplicate = await register("REPEAT@example.com");

  assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.body, { status: "verification_sent" });
  const users = await client.query("SELECT id FROM users");
  assert.equal(users.rowCount, 1);
  const consent = await client.query("SELECT id FROM consent_records");
  assert.equal(consent.rowCount, 2);
  const audit = await client.query("SELECT id FROM audit_logs WHERE action = 'USER_REGISTERED'");
  assert.equal(audit.rowCount, 1);
  assert.equal(sender?.messages.length, 0, "no second verification email");
});

test("an under-18 attempt is rejected, blocked, and creates no account", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  const underage = new Date();
  underage.setUTCFullYear(underage.getUTCFullYear() - 10);
  const response = await register("minor@example.com", underage.toISOString().slice(0, 10));

  assert.equal(response.status, 422);
  assert.equal(response.body?.code, "UNDER_MINIMUM_AGE");

  const users = await client.query("SELECT id FROM users");
  assert.equal(users.rowCount, 0);
  const blocks = await client.query<{ email_hash: string; reason: string; expires_at: Date }>(
    "SELECT email_hash, reason, expires_at FROM signup_blocks",
  );
  assert.equal(blocks.rowCount, 1);
  assert.equal(blocks.rows[0].reason, "UNDER_18");
  assert.match(blocks.rows[0].email_hash, /^[0-9a-f]{64}$/);
  assert.ok(blocks.rows[0].expires_at > new Date());
});

test("a verification link verifies once and a second use stays verified without error", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(sender);

  await register("verify@example.com");
  const token = tokenFromEmail(await sender.last("verify-email"), "/api/auth/verify");

  const first = await request("GET", `/v1/auth/verify?token=${encodeURIComponent(token)}`);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { status: "verified" });

  const users = await client.query<{ email_verified: boolean }>("SELECT email_verified FROM users");
  assert.equal(users.rows[0].email_verified, true);
  const audit = await client.query("SELECT action FROM audit_logs WHERE action = 'EMAIL_VERIFIED'");
  assert.equal(audit.rowCount, 1);

  const second = await request("GET", `/v1/auth/verify?token=${encodeURIComponent(token)}`);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { status: "verified" });
  const auditAfterSecondUse = await client.query("SELECT id FROM audit_logs WHERE action = 'EMAIL_VERIFIED'");
  assert.equal(auditAfterSecondUse.rowCount, 1, "no duplicate audit entry on replay");
});

test("an expired verification link is rejected and the account stays unverified", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("expired@example.com");
  const email = await (async () => {
    assert.ok(sender);
    return sender.last("verify-email");
  })();
  const validToken = tokenFromEmail(email, "/api/auth/verify");

  const expiredToken = await createEmailVerificationToken(TEST_AUTH_SECRET, "expired@example.com", undefined, -1);
  assert.notEqual(expiredToken, validToken);

  const response = await request("GET", `/v1/auth/verify?token=${encodeURIComponent(expiredToken)}`);
  assert.equal(response.status, 400);
  assert.equal(response.body?.code, "INVALID_VERIFICATION_LINK");

  const users = await client.query<{ email_verified: boolean }>("SELECT email_verified FROM users");
  assert.equal(users.rows[0].email_verified, false);
});

test("sign-in stores a session row and sign-out revokes it", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("session@example.com");
  const signedIn = await signIn("session@example.com");
  assert.equal(signedIn.status, 200);
  const token = String(signedIn.body?.session_token);
  assert.ok(token.length > 0);

  const sessions = await client.query<{ id: string; expires_at: Date; user_id: string }>(
    "SELECT id, expires_at, user_id FROM sessions",
  );
  assert.equal(sessions.rowCount, 1);
  const lifetimeDays = (sessions.rows[0].expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(lifetimeDays > 29 && lifetimeDays < 31, `session lifetime was ${lifetimeDays} days`);

  const signedOut = await request("POST", "/v1/auth/sign-out", undefined, token);
  assert.equal(signedOut.status, 200);
  assert.deepEqual(signedOut.body, { status: "signed_out" });

  const afterSignOut = await request("POST", "/v1/auth/sign-out", undefined, token);
  assert.equal(afterSignOut.status, 401);
  assert.equal(afterSignOut.body?.code, "UNAUTHENTICATED");

  const audit = await client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE action IN ('SIGN_IN_SUCCEEDED', 'SIGNED_OUT') ORDER BY action",
  );
  assert.deepEqual(
    audit.rows.map((row) => row.action),
    ["SIGNED_OUT", "SIGN_IN_SUCCEEDED"],
  );
});

test("unknown email and wrong password return the same 401 body", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("known@example.com");
  const wrongPassword = await signIn("known@example.com", "a wrong but long password");
  const unknownEmail = await signIn("unknown@example.com", PASSWORD);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  const withoutCorrelation = (body: Record<string, unknown> | undefined): Record<string, unknown> => {
    const copy = { ...(body ?? {}) };
    delete copy.request_id;
    return copy;
  };
  assert.deepEqual(withoutCorrelation(wrongPassword.body), withoutCorrelation(unknownEmail.body));

  const failures = await client.query<{ actor_user_id: string | null; metadata: unknown }>(
    "SELECT actor_user_id, metadata FROM audit_logs WHERE action = 'SIGN_IN_FAILED'",
  );
  assert.equal(failures.rowCount, 2);
  for (const row of failures.rows) {
    assert.equal(row.actor_user_id, null);
    assert.deepEqual(row.metadata, {});
    assert.ok(!JSON.stringify(row.metadata).includes("known@example.com"));
  }
});

test("no audit entry contains a password, token, or raw email", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  const email = "audit@example.com";
  await register(email);
  const signedIn = await signIn(email);
  const token = String(signedIn.body?.session_token);
  await request("POST", "/v1/auth/sign-out-everywhere", undefined, token);

  const entries = await client.query<{ action: string; metadata: unknown; actor_role: string }>(
    "SELECT action, metadata, actor_role FROM audit_logs",
  );
  assert.ok((entries.rowCount ?? 0) >= 3);
  for (const entry of entries.rows) {
    const serialized = JSON.stringify(entry.metadata);
    assert.ok(!serialized.includes(PASSWORD), "no password in audit metadata");
    assert.ok(!serialized.includes(email), "no raw email in audit metadata");
    assert.ok(!serialized.includes(token), "no session token in audit metadata");
    assert.ok(!/password|hash|token|email/i.test(serialized), "no sensitive keys in audit metadata");
  }
});

test("sign-out-everywhere makes another session fail on its next request", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("everywhere@example.com");
  const first = String((await signIn("everywhere@example.com")).body?.session_token);
  const second = String((await signIn("everywhere@example.com")).body?.session_token);
  assert.notEqual(first, second);
  assert.equal((await client.query("SELECT id FROM sessions")).rowCount, 2);

  const everywhere = await request("POST", "/v1/auth/sign-out-everywhere", undefined, first);
  assert.equal(everywhere.status, 200);
  assert.deepEqual(everywhere.body, { status: "signed_out_everywhere" });
  assert.equal((await client.query("SELECT id FROM sessions")).rowCount, 0);

  const otherSession = await request("POST", "/v1/auth/sign-out", undefined, second);
  assert.equal(otherSession.status, 401);
  assert.equal(otherSession.body?.code, "UNAUTHENTICATED");
});

test("forgot-password answers identically for a known and an unknown address", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("reset@example.com");
  sender?.reset();

  const known = await request("POST", "/v1/auth/forgot-password", { email: "reset@example.com" });
  const unknown = await request("POST", "/v1/auth/forgot-password", { email: "ghost@example.com" });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  const withoutCorrelation = (body: Record<string, unknown> | undefined): Record<string, unknown> => {
    const copy = { ...(body ?? {}) };
    delete copy.request_id;
    return copy;
  };
  assert.deepEqual(withoutCorrelation(known.body), withoutCorrelation(unknown.body));

  const requests = await client.query("SELECT id FROM audit_logs WHERE action = 'PASSWORD_RESET_REQUESTED'");
  assert.equal(requests.rowCount, 2);
  assert.equal(sender?.messages.length, 1, "only the known address receives an email");
});

test("a password reset revokes every session and the reset token cannot be reused", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(sender);

  await register("revoke@example.com");
  const first = String((await signIn("revoke@example.com")).body?.session_token);
  const second = String((await signIn("revoke@example.com")).body?.session_token);

  await request("POST", "/v1/auth/forgot-password", { email: "revoke@example.com" });
  const resetToken = tokenFromEmail(await sender.last("reset-password"), "/reset");

  const newPassword = "another long passphrase for reset";
  const reset = await request("POST", "/v1/auth/reset-password", {
    token: resetToken,
    new_password: newPassword,
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body, { status: "password_reset" });

  assert.equal((await client.query("SELECT id FROM sessions")).rowCount, 0);
  for (const token of [first, second]) {
    const rejected = await request("POST", "/v1/auth/sign-out", undefined, token);
    assert.equal(rejected.status, 401);
  }

  const reuse = await request("POST", "/v1/auth/reset-password", {
    token: resetToken,
    new_password: newPassword,
  });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body?.code, "INVALID_RESET_TOKEN");

  const signedIn = await signIn("revoke@example.com", newPassword);
  assert.equal(signedIn.status, 200);

  const audits = await client.query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE action IN ('PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED') ORDER BY action",
  );
  assert.deepEqual(
    audits.rows.map((row) => row.action),
    ["PASSWORD_RESET_COMPLETED", "PASSWORD_RESET_REQUESTED"],
  );
});

test("a short password is rejected at registration and at reset", async (context) => {
  if (!requireStack(context)) {
    return;
  }

  const registration = await request("POST", "/v1/auth/register", {
    display_name: "Short Password",
    email: "short@example.com",
    password: "elevenchars",
    date_of_birth: "2000-01-01",
  });
  assert.equal(registration.status, 422);
  assert.equal(registration.body?.code, "VALIDATION_FAILED");

  const missingField = await request("POST", "/v1/auth/register", {
    display_name: "Missing Email",
    password: PASSWORD,
    date_of_birth: "2000-01-01",
  });
  assert.equal(missingField.status, 422);
  assert.equal(missingField.body?.code, "VALIDATION_FAILED");
});
