import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { Module, type INestApplication, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { createEmailVerificationToken } from "better-auth/api";

import { createIdentityAuth } from "../src/identity/better-auth.js";
import { BetterAuthIdentityService } from "../src/identity/better-auth-identity.service.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { IDENTITY_SERVICE } from "../src/identity/identity.tokens.js";
import { MeController } from "../src/me/me.controller.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
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
let identity: BetterAuthIdentityService | undefined;

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
  identity = service;

  @Module({
    controllers: [AuthController, MeController],
    providers: [
      { provide: IDENTITY_SERVICE, useValue: service },
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(connection.db) },
    ],
  })
  class IdentityTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(AuthController, MeController);
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

/** Registers and opens the verification link, which activates the account. */
async function registerAndVerify(email: string, dateOfBirth = "2000-01-01"): Promise<void> {
  const registration = await register(email, dateOfBirth);
  assert.equal(registration.status, 200, "registration must succeed before verification");
  assert.ok(sender, "the email sender must be recording");
  const token = tokenFromEmail(await sender.last("verify-email"), "/api/auth/verify");
  const verified = await request("GET", `/v1/auth/verify?token=${encodeURIComponent(token)}`);
  assert.equal(verified.status, 200);
}

async function sessionCount(client: TestDatabase["client"], email: string): Promise<number> {
  const result = await client.query(
    "SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1",
    [email],
  );
  return result.rowCount ?? 0;
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

test("a blocked email is refused whatever date of birth is submitted", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  const underage = new Date();
  underage.setUTCFullYear(underage.getUTCFullYear() - 10);
  const first = await register("blocked@example.com", underage.toISOString().slice(0, 10));
  assert.equal(first.status, 422);
  assert.equal(first.body?.code, "UNDER_MINIMUM_AGE");

  // The same address with an adult date of birth is the evasion the block exists
  // to stop.
  const retry = await register("blocked@example.com", "1990-05-05");
  assert.equal(retry.status, 422);
  assert.equal(retry.body?.code, "UNDER_MINIMUM_AGE");
  assert.ok(!retry.text.includes("blocked@example.com"), "the refusal names no address");

  const users = await client.query("SELECT id FROM users");
  assert.equal(users.rowCount, 0, "no account is written");
  const consent = await client.query("SELECT id FROM consent_records");
  assert.equal(consent.rowCount, 0, "no consent is written");
  const audit = await client.query("SELECT id FROM audit_logs");
  assert.equal(audit.rowCount, 0, "no audit entry is written");

  const blocks = await client.query<{ email_hash: string }>("SELECT email_hash FROM signup_blocks");
  assert.equal(blocks.rowCount, 1);
  assert.match(blocks.rows[0].email_hash, /^[0-9a-f]{64}$/, "only a keyed hash is stored");
  assert.ok(!blocks.rows[0].email_hash.includes("blocked"), "the address is not recoverable");
});

test("an expired block allows registration", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  const underage = new Date();
  underage.setUTCFullYear(underage.getUTCFullYear() - 10);
  await register("expired-block@example.com", underage.toISOString().slice(0, 10));
  await client.query("UPDATE signup_blocks SET expires_at = now() - interval '1 day'");

  const allowed = await register("expired-block@example.com");
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { status: "verification_sent" });
  const users = await client.query<{ status: string }>("SELECT status FROM users");
  assert.equal(users.rowCount, 1);
  assert.equal(users.rows[0].status, "PENDING");
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

  const users = await client.query<{ email_verified: boolean; status: string }>(
    "SELECT email_verified, status FROM users",
  );
  assert.equal(users.rows[0].email_verified, true);
  assert.equal(users.rows[0].status, "ACTIVE", "verification activates the account");
  const audit = await client.query("SELECT action FROM audit_logs WHERE action = 'EMAIL_VERIFIED'");
  assert.equal(audit.rowCount, 1);

  const second = await request("GET", `/v1/auth/verify?token=${encodeURIComponent(token)}`);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { status: "verified" });
  const auditAfterSecondUse = await client.query("SELECT id FROM audit_logs WHERE action = 'EMAIL_VERIFIED'");
  assert.equal(auditAfterSecondUse.rowCount, 1, "no duplicate audit entry on replay");
  const activations = await client.query("SELECT id FROM audit_logs WHERE action = 'ACCOUNT_ACTIVATED'");
  assert.equal(activations.rowCount, 1, "no second activation on replay");
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

  const users = await client.query<{ email_verified: boolean; status: string }>(
    "SELECT email_verified, status FROM users",
  );
  assert.equal(users.rows[0].email_verified, false);
  assert.equal(users.rows[0].status, "PENDING", "a rejected link never activates the account");
});

test("sign-in stores a session row and sign-out revokes it", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await registerAndVerify("session@example.com");
  const signedIn = await signIn("session@example.com");
  assert.equal(signedIn.status, 200);
  assert.equal(
    (signedIn.body?.account as Record<string, unknown> | undefined)?.account_status,
    "active",
    "the sign-in response reports the account status",
  );
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

test("an unverified account is refused after its password is accepted and holds no session", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await register("pending@example.com");
  const refused = await signIn("pending@example.com");

  assert.equal(refused.status, 403);
  assert.equal(refused.body?.code, "EMAIL_NOT_VERIFIED");
  assert.equal(await sessionCount(client, "pending@example.com"), 0, "no session row for an unverified account");

  const users = await client.query<{ status: string; email_verified: boolean }>(
    "SELECT status, email_verified FROM users WHERE email = $1",
    ["pending@example.com"],
  );
  assert.equal(users.rows[0].status, "PENDING");
  assert.equal(users.rows[0].email_verified, false);
});

test("a wrong password on an unverified account still returns the generic 401", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }

  await register("pending-wrong@example.com");
  const refused = await signIn("pending-wrong@example.com", "a wrong but long password");

  assert.equal(refused.status, 401);
  assert.equal(refused.body?.code, "UNAUTHENTICATED");
});

test("a suspended account is refused after its password is accepted and holds no session", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("suspended@example.com");
  await registerAndVerify("admin@example.com");
  const ids = await client.query<{ id: string; email: string }>("SELECT id, email FROM users");
  const subject = ids.rows.find((row) => row.email === "suspended@example.com");
  const admin = ids.rows.find((row) => row.email === "admin@example.com");
  assert.ok(subject && admin);

  await identity.suspendAccount({
    userId: subject.id,
    reason: "pilot suspension",
    actorUserId: admin.id,
    requestId: "req-suspend-1",
  });

  const refused = await signIn("suspended@example.com");
  assert.equal(refused.status, 403);
  assert.equal(refused.body?.code, "ACCOUNT_SUSPENDED");
  assert.equal(await sessionCount(client, "suspended@example.com"), 0);

  // A wrong password is still the generic 401, so status is not an oracle.
  const wrongPassword = await signIn("suspended@example.com", "a wrong but long password");
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body?.code, "UNAUTHENTICATED");
});

test("suspension kills an open session on its next request", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("open@example.com");
  const signedIn = await signIn("open@example.com");
  assert.equal(signedIn.status, 200);
  const token = String(signedIn.body?.session_token);
  assert.equal(await sessionCount(client, "open@example.com"), 1);

  const [user] = (await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "open@example.com",
  ])).rows;

  await identity.suspendAccount({
    userId: user.id,
    reason: "pilot suspension",
    actorUserId: user.id,
    requestId: "req-suspend-2",
  });

  assert.equal(await sessionCount(client, "open@example.com"), 0, "every session row is gone");
  const next = await request("POST", "/v1/auth/sign-out", undefined, token);
  assert.equal(next.status, 401);
  assert.equal(next.body?.code, "UNAUTHENTICATED");

  const audit = await client.query<{ actor_user_id: string | null; reason: string | null; metadata: unknown }>(
    "SELECT actor_user_id, reason, metadata FROM audit_logs WHERE action = 'ACCOUNT_SUSPENDED'",
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor_user_id, user.id);
  assert.equal(audit.rows[0].reason, "pilot suspension");
  assert.deepEqual(audit.rows[0].metadata, {});
  assert.ok(!JSON.stringify(audit.rows[0]).includes(token), "no session token in the audit entry");
});

test("a suspension that fails partway leaves the status and sessions unchanged", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("atomic@example.com");
  await signIn("atomic@example.com");
  const [user] = (await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "atomic@example.com",
  ])).rows;

  // A nonexistent actor violates the audit foreign key, so the whole
  // transaction must roll back.
  await assert.rejects(
    identity.suspendAccount({
      userId: user.id,
      reason: "pilot suspension",
      actorUserId: "no-such-actor",
      requestId: "req-suspend-3",
    }),
  );

  const after = await client.query<{ status: string }>("SELECT status FROM users WHERE id = $1", [user.id]);
  assert.equal(after.rows[0].status, "ACTIVE");
  assert.equal(await sessionCount(client, "atomic@example.com"), 1, "the session survives the rollback");
  const audit = await client.query("SELECT id FROM audit_logs WHERE action = 'ACCOUNT_SUSPENDED'");
  assert.equal(audit.rowCount, 0);
});

test("deactivation revokes the caller's own session and names the actor", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("leave@example.com");
  const token = String((await signIn("leave@example.com")).body?.session_token);

  await identity.deactivateAccount({ sessionToken: token, requestId: "req-deactivate-1" });

  const users = await client.query<{ id: string; status: string }>(
    "SELECT id, status FROM users WHERE email = $1",
    ["leave@example.com"],
  );
  assert.equal(users.rows[0].status, "DEACTIVATED");
  assert.equal(await sessionCount(client, "leave@example.com"), 0);

  const next = await request("POST", "/v1/auth/sign-out", undefined, token);
  assert.equal(next.status, 401);

  const audit = await client.query<{ actor_user_id: string | null }>(
    "SELECT actor_user_id FROM audit_logs WHERE action = 'ACCOUNT_DEACTIVATED'",
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor_user_id, users.rows[0].id);

  // An invalid session never changes anything.
  await assert.rejects(
    identity.deactivateAccount({ sessionToken: "not-a-session", requestId: "req-deactivate-2" }),
    { code: "SESSION_INVALID" },
  );
  const after = await client.query<{ status: string }>("SELECT status FROM users WHERE email = $1", [
    "leave@example.com",
  ]);
  assert.equal(after.rows[0].status, "DEACTIVATED");
});

test("deactivation is reversible by signing in and records one activation", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("resume@example.com");
  const first = String((await signIn("resume@example.com")).body?.session_token);
  await identity.deactivateAccount({ sessionToken: first, requestId: "req-deactivate-3" });

  const resumed = await signIn("resume@example.com");
  assert.equal(resumed.status, 200, "a deactivated account that signs in is active again");
  assert.equal(
    (resumed.body?.account as Record<string, unknown> | undefined)?.account_status,
    "active",
    "the response reports the post-transition status, not the pre-transition one",
  );

  const users = await client.query<{ status: string }>("SELECT status FROM users WHERE email = $1", [
    "resume@example.com",
  ]);
  assert.equal(users.rows[0].status, "ACTIVE");
  assert.equal(await sessionCount(client, "resume@example.com"), 1);

  // One activation for verification plus one for the resume, never a third.
  const activations = await client.query("SELECT id FROM audit_logs WHERE action = 'ACCOUNT_ACTIVATED'");
  assert.equal(activations.rowCount, 2);
});

test("activation never revives a suspended account", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("revive@example.com");
  const [user] = (await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "revive@example.com",
  ])).rows;
  await identity.suspendAccount({
    userId: user.id,
    reason: "pilot suspension",
    actorUserId: user.id,
    requestId: "req-suspend-4",
  });

  const summary = await identity.activateAccount({ userId: user.id, requestId: "req-activate-1" });
  assert.equal(summary.accountStatus, "SUSPENDED");
  const after = await client.query<{ status: string }>("SELECT status FROM users WHERE id = $1", [user.id]);
  assert.equal(after.rows[0].status, "SUSPENDED");
});

test("GET /v1/me returns the account record and the caller's own (null) profiles", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await registerAndVerify("me@example.com");
  await registerAndVerify("other@example.com");
  const signedIn = await signIn("me@example.com");
  assert.equal(signedIn.status, 200);
  const token = String(signedIn.body?.session_token);

  const response = await request("GET", "/v1/me", undefined, token);
  assert.equal(response.status, 200);
  const body = response.body ?? {};
  assert.deepEqual(Object.keys(body).sort(), [
    "account_status",
    "display_name",
    "email",
    "email_verified",
    "id",
    "mentor_profile",
    "student_profile",
    "timezone",
  ]);
  assert.equal(body.email, "me@example.com");
  assert.equal(body.email_verified, true);
  assert.equal(body.account_status, "active");
  assert.equal(body.timezone, "Asia/Dhaka");
  assert.equal(body.student_profile, null, "no profile exists until one is saved");
  assert.equal(body.mentor_profile, null, "no profile exists until one is saved");
  // The sign-in response is unchanged: `AccountSummary` gained no properties.
  const signInAccount = signedIn.body?.account as Record<string, unknown>;
  assert.deepEqual(Object.keys(signInAccount).sort(), [
    "account_status",
    "display_name",
    "email",
    "email_verified",
    "id",
    "timezone",
  ]);
  assert.ok(!response.text.includes("other@example.com"), "no other user's data");
  assert.equal((await client.query("SELECT id FROM users")).rowCount, 2);
});

test("GET /v1/me without a valid session is 401 and returns no account data", async (context) => {
  if (!requireStack(context)) {
    return;
  }

  const missing = await request("GET", "/v1/me");
  assert.equal(missing.status, 401);
  assert.equal(missing.body?.code, "UNAUTHENTICATED");
  assert.equal(missing.body?.email, undefined);

  const bogus = await request("GET", "/v1/me", undefined, "not-a-session");
  assert.equal(bogus.status, 401);
  assert.equal(bogus.body?.email, undefined);
});

test("POST /v1/me/deactivate deactivates the caller and revokes every session", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await registerAndVerify("bff@example.com");
  const token = String((await signIn("bff@example.com")).body?.session_token);

  const response = await request("POST", "/v1/me/deactivate", undefined, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "deactivated" });

  const users = await client.query<{ status: string }>("SELECT status FROM users WHERE email = $1", [
    "bff@example.com",
  ]);
  assert.equal(users.rows[0].status, "DEACTIVATED");
  assert.equal(await sessionCount(client, "bff@example.com"), 0);

  const after = await request("GET", "/v1/me", undefined, token);
  assert.equal(after.status, 401);

  const withoutSession = await request("POST", "/v1/me/deactivate");
  assert.equal(withoutSession.status, 401);
});

test("a deletion-pending or anonymized account is refused without a status code leak", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  for (const status of ["DELETION_PENDING", "ANONYMIZED"] as const) {
    await registerAndVerify(`gone-${status.toLowerCase()}@example.com`);
    await client.query("UPDATE users SET status = $1 WHERE email = $2", [
      status,
      `gone-${status.toLowerCase()}@example.com`,
    ]);

    const refused = await signIn(`gone-${status.toLowerCase()}@example.com`);
    assert.equal(refused.status, 403, `${status} sign-in is refused`);
    assert.equal(refused.body?.code, "FORBIDDEN");
    assert.equal(await sessionCount(client, `gone-${status.toLowerCase()}@example.com`), 0);
  }
});

test("deactivation cannot overwrite a suspension", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;
  assert.ok(identity);

  await registerAndVerify("sanctioned@example.com");
  const token = String((await signIn("sanctioned@example.com")).body?.session_token);
  const [user] = (await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    "sanctioned@example.com",
  ])).rows;

  // Simulates the narrow race: the status changed after the session was read.
  await client.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [user.id]);

  await assert.rejects(identity.deactivateAccount({ sessionToken: token, requestId: "req-race" }), {
    code: "SESSION_INVALID",
  });
  const after = await client.query<{ status: string }>("SELECT status FROM users WHERE id = $1", [user.id]);
  assert.equal(after.rows[0].status, "SUSPENDED", "the sanction survives");
  const audits = await client.query("SELECT id FROM audit_logs WHERE action = 'ACCOUNT_DEACTIVATED'");
  assert.equal(audits.rowCount, 0);
});

test("a verified account whose activation write failed repairs itself at sign-in", async (context) => {
  const stack = requireStack(context);
  if (!stack) {
    return;
  }
  const { client } = stack;

  await registerAndVerify("repair@example.com");
  // The state a failed activation leaves behind: the address is verified and
  // the token is spent, but the status never moved.
  await client.query("UPDATE users SET status = 'PENDING' WHERE email = $1", ["repair@example.com"]);

  const signedIn = await signIn("repair@example.com");
  assert.equal(signedIn.status, 200, "the account is not locked out");
  const users = await client.query<{ status: string }>("SELECT status FROM users WHERE email = $1", [
    "repair@example.com",
  ]);
  assert.equal(users.rows[0].status, "ACTIVE");
  assert.equal(await sessionCount(client, "repair@example.com"), 1);
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
  await registerAndVerify(email);
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

  await registerAndVerify("everywhere@example.com");
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

  await registerAndVerify("revoke@example.com");
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
