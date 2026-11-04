import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import type { Database } from "../src/db/database.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  TEST_PASSWORD,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

/** Stub credentials: shaped like a real client id, never valid at Google. */
const STUB_GOOGLE = {
  clientId: "stub-client-id.apps.googleusercontent.com",
  clientSecret: "stub-client-secret",
};

let withProvider: TestApiStack | undefined;
let withoutProvider: TestApiStack | undefined;
let skipReason = "";

function requireStacks(context: TestContext): TestApiStack | null {
  if (!withProvider || !withoutProvider) {
    context.skip(skipReason || "connect_test is not reachable");
    return null;
  }
  return withProvider;
}

before(async () => {
  const providers = (database: Database) => [
    { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
  ];

  const configured = await startApiStack({
    controllers: [AuthController, MeController],
    requestIdRoutes: [AuthController, MeController],
    providers,
    google: STUB_GOOGLE,
  });
  if (configured.skipped) {
    skipReason = configured.reason;
    return;
  }
  withProvider = configured.stack;

  // The same API without provider credentials: only this boot difference makes
  // the `503 PROVIDER_UNAVAILABLE` answer observable (design D3).
  const unconfigured = await startApiStack({
    controllers: [AuthController, MeController],
    requestIdRoutes: [AuthController, MeController],
    providers,
    reset: false,
  });
  if (unconfigured.skipped) {
    skipReason = unconfigured.reason;
    return;
  }
  withoutProvider = unconfigured.stack;
});

beforeEach(async () => {
  if (!withProvider) {
    return;
  }
  await truncateAll(withProvider.client);
  withProvider.sender.reset();
  withoutProvider?.sender.reset();
});

after(async () => {
  await withoutProvider?.close();
  await withProvider?.close();
});

// --- helpers ---------------------------------------------------------------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index < 0) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238, 6 digits, 30-second period — the plugin's defaults. */
function totpCode(secret: string, counter = Math.floor(Date.now() / 30_000)): string {
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000;
  return String(code).padStart(6, "0");
}

function secretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  assert.ok(secret, "the enrollment URI must carry a secret");
  return secret;
}

async function activeSession(stack: TestApiStack, email: string): Promise<string> {
  await registerAndVerify(stack, email);
  const result = await signIn(stack, email);
  assert.equal(result.status, 200);
  return String(result.body?.session_token);
}

/** Enrolls a factor and returns the confirmed backup codes and the live token. */
async function enrolledMfa(
  stack: TestApiStack,
  email: string,
): Promise<{ secret: string; backupCodes: string[]; sessionToken: string }> {
  const sessionToken = await activeSession(stack, email);
  const enrollment = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    sessionToken,
  );
  assert.equal(enrollment.status, 200, enrollment.text);
  const secret = secretFromUri(String(enrollment.body?.totp_uri));
  const verified = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/verify",
    { code: totpCode(secret) },
    sessionToken,
  );
  assert.equal(verified.status, 200, verified.text);
  return {
    secret,
    backupCodes: enrollment.body?.backup_codes as string[],
    sessionToken: String(verified.body?.session_token),
  };
}

async function auditActions(stack: TestApiStack): Promise<{ action: string; metadata: unknown }[]> {
  const result = await stack.client.query<{ action: string; metadata: unknown }>(
    "SELECT action, metadata FROM audit_logs ORDER BY occurred_at",
  );
  return result.rows;
}

// --- second factor ---------------------------------------------------------

test("enrollment returns the URI and backup codes once and leaves the factor inactive", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const sessionToken = await activeSession(stack, "enroll@example.com");
  const enrollment = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    sessionToken,
  );

  assert.equal(enrollment.status, 200, enrollment.text);
  assert.match(String(enrollment.body?.totp_uri), /^otpauth:\/\/totp\//);
  assert.equal((enrollment.body?.backup_codes as string[]).length, 10);

  const [user] = (
    await stack.client.query<{ two_factor_enabled: boolean }>(
      "SELECT two_factor_enabled FROM users WHERE email = $1",
      ["enroll@example.com"],
    )
  ).rows;
  assert.equal(user?.two_factor_enabled, false, "the factor is not active before a valid code");

  const [factor] = (
    await stack.client.query<{ verified: boolean }>("SELECT verified FROM two_factors")
  ).rows;
  assert.equal(factor?.verified, false);
});

test("enrollment with a wrong password is a validation error and creates no secret", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const sessionToken = await activeSession(stack, "wrongpass@example.com");
  const enrollment = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: "a wrong but long password" },
    sessionToken,
  );

  assert.equal(enrollment.status, 422, enrollment.text);
  assert.equal(enrollment.body?.code, "VALIDATION_FAILED");
  const counted = await stack.client.query("SELECT count(*)::int AS count FROM two_factors");
  assert.equal(counted.rows[0].count, 0);
});

test("a confirmed factor withholds the session and a valid code releases it", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const { secret } = await enrolledMfa(stack, "challenge@example.com");
  // Clear the enrollment session so the count below measures this sign-in only.
  await stack.client.query("DELETE FROM sessions");

  const challenged = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "challenge@example.com",
    password: TEST_PASSWORD,
  });
  assert.equal(challenged.status, 200, challenged.text);
  assert.equal(challenged.body?.mfa_required, true);
  assert.equal(challenged.body?.session_token, undefined, "no session is issued by the challenge");

  const live = await stack.client.query("SELECT count(*)::int AS count FROM sessions");
  assert.equal(live.rows[0].count, 0, "the challenged sign-in leaves no session row");

  const verified = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code: totpCode(secret),
    mfa_challenge: challenged.body?.mfa_challenge,
  });
  assert.equal(verified.status, 200, verified.text);

  const me = await apiRequest(
    stack,
    "GET",
    "/v1/me",
    undefined,
    String(verified.body?.session_token),
  );
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body?.email, "challenge@example.com");
});

test("a challenge is single use and a tampered one is refused", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const { secret } = await enrolledMfa(stack, "replay@example.com");
  const challenged = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "replay@example.com",
    password: TEST_PASSWORD,
  });
  const challenge = String(challenged.body?.mfa_challenge);

  const first = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code: totpCode(secret),
    mfa_challenge: challenge,
  });
  assert.equal(first.status, 200, first.text);

  const replay = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code: totpCode(secret),
    mfa_challenge: challenge,
  });
  assert.equal(replay.status, 401, replay.text);

  // The session from the first verification still works after the replay.
  const me = await apiRequest(stack, "GET", "/v1/me", undefined, String(first.body?.session_token));
  assert.equal(me.status, 200);

  const tampered = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code: totpCode(secret),
    mfa_challenge: challenge.replace(/.$/, "0"),
  });
  assert.equal(tampered.status, 401, tampered.text);
});

test("a wrong code is refused and audited without secret material", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  await enrolledMfa(stack, "wrongcode@example.com");
  const challenged = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "wrongcode@example.com",
    password: TEST_PASSWORD,
  });

  const refused = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code: "000000",
    mfa_challenge: challenged.body?.mfa_challenge,
  });
  assert.equal(refused.status, 401, refused.text);

  const entries = await auditActions(stack);
  const failed = entries.filter((entry) => entry.action === "MFA_VERIFICATION_FAILED");
  assert.equal(failed.length, 1);
  assert.equal(JSON.stringify(failed[0].metadata), "{}", "no code, secret, or challenge in metadata");
});

test("a backup code works once and is then refused", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const { backupCodes } = await enrolledMfa(stack, "backup@example.com");
  const code = backupCodes[0];

  const challenged = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "backup@example.com",
    password: TEST_PASSWORD,
  });
  const accepted = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code,
    mfa_challenge: challenged.body?.mfa_challenge,
    method: "backup_code",
  });
  assert.equal(accepted.status, 200, accepted.text);

  const second = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "backup@example.com",
    password: TEST_PASSWORD,
  });
  const refused = await apiRequest(stack, "POST", "/v1/auth/mfa/verify", {
    code,
    mfa_challenge: second.body?.mfa_challenge,
    method: "backup_code",
  });
  assert.equal(refused.status, 401, refused.text);
});

test("disable requires the password and restores a single-step sign-in", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const { sessionToken } = await enrolledMfa(stack, "disable@example.com");

  const wrong = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/disable",
    { password: "a wrong but long password" },
    sessionToken,
  );
  assert.equal(wrong.status, 422, wrong.text);

  const disabled = await apiRequest(
    stack,
    "POST",
    "/v1/auth/mfa/disable",
    { password: TEST_PASSWORD },
    sessionToken,
  );
  assert.equal(disabled.status, 200, disabled.text);

  // The library rotated the session, so only the returned token is live.
  const rotated = await apiRequest(
    stack,
    "GET",
    "/v1/me",
    undefined,
    String(disabled.body?.session_token),
  );
  assert.equal(rotated.status, 200, rotated.text);

  const plain = await apiRequest(stack, "POST", "/v1/auth/sign-in", {
    email: "disable@example.com",
    password: TEST_PASSWORD,
  });
  assert.equal(plain.status, 200);
  assert.equal(plain.body?.mfa_required, false);
  assert.ok(plain.body?.session_token);
});

// --- sessions --------------------------------------------------------------

test("the session list shows only the caller's live sessions and marks the current one", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const first = await activeSession(stack, "list@example.com");
  const second = String(
    (await signIn(stack, "list@example.com")).body?.session_token,
  );
  await activeSession(stack, "other@example.com");

  const listed = await apiRequest(stack, "GET", "/v1/me/sessions", undefined, second);
  assert.equal(listed.status, 200, listed.text);
  const data = listed.body?.data as { id: string; current: boolean }[];
  assert.equal(data.length, 2);
  assert.equal(data.filter((row) => row.current).length, 1);
  assert.ok(!listed.text.includes(second), "the response must not carry a session token");
  assert.ok(!listed.text.includes(first), "the response must not carry another session token");
});

test("expired sessions are omitted from the list", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const live = await activeSession(stack, "expired@example.com");
  const stale = String((await signIn(stack, "expired@example.com")).body?.session_token);

  // Expire only the second session; the caller's own row stays live.
  await stack.client.query("UPDATE sessions SET expires_at = now() - interval '1 day' WHERE token = $1", [
    stale.split(".")[0],
  ]);

  const listed = await apiRequest(stack, "GET", "/v1/me/sessions", undefined, live);
  assert.equal(listed.status, 200, listed.text);
  assert.equal((listed.body?.data as unknown[]).length, 1, "the expired row is not listed");
});

test("revoking a session once ends it, twice is still a success with one audit row", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const current = await activeSession(stack, "revoke@example.com");
  const other = String((await signIn(stack, "revoke@example.com")).body?.session_token);
  const [row] = (
    await stack.client.query<{ id: string }>(
      "SELECT id FROM sessions WHERE token <> $1",
      [current.split(".")[0]],
    )
  ).rows;

  const revoked = await apiRequest(stack, "DELETE", `/v1/me/sessions/${row.id}`, undefined, current);
  assert.equal(revoked.status, 204, revoked.text);

  const refused = await apiRequest(stack, "GET", "/v1/me", undefined, other);
  assert.equal(refused.status, 401, "the revoked session fails on its next request");

  const again = await apiRequest(stack, "DELETE", `/v1/me/sessions/${row.id}`, undefined, current);
  assert.equal(again.status, 204, again.text);

  const entries = await auditActions(stack);
  assert.equal(entries.filter((entry) => entry.action === "SESSION_REVOKED").length, 1);
});

test("revoking another account's session is not found and changes nothing", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const mine = await activeSession(stack, "mine@example.com");
  const theirs = await activeSession(stack, "theirs@example.com");
  const [row] = (
    await stack.client.query<{ id: string }>("SELECT id FROM sessions WHERE token = $1", [
      theirs.split(".")[0],
    ])
  ).rows;

  const refused = await apiRequest(stack, "DELETE", `/v1/me/sessions/${row.id}`, undefined, mine);
  assert.equal(refused.status, 404, refused.text);

  const stillThere = await apiRequest(stack, "GET", "/v1/me", undefined, theirs);
  assert.equal(stillThere.status, 200, "the other account's session still works");

  const entries = await auditActions(stack);
  assert.equal(entries.filter((entry) => entry.action === "SESSION_REVOKED").length, 0);
});

// --- provider --------------------------------------------------------------

test("an unconfigured provider answers 503 and does not fall back", async (t) => {
  const stack = requireStacks(t);
  if (!stack || !withoutProvider) return;

  const started = await apiRequest(withoutProvider, "POST", "/v1/auth/sign-in/provider", {
    provider: "google",
    callback_url: "http://localhost:3000/sign-in",
  });
  assert.equal(started.status, 503, started.text);
  assert.equal(started.body?.code, "PROVIDER_UNAVAILABLE");
});

test("an unknown provider is a validation error", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const started = await apiRequest(stack, "POST", "/v1/auth/sign-in/provider", {
    provider: "facebook",
    callback_url: "http://localhost:3000/sign-in",
  });
  assert.equal(started.status, 422, started.text);
  assert.equal(started.body?.code, "VALIDATION_FAILED");
});

test("a configured provider returns a Google authorization URL with this client id", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const started = await apiRequest(stack, "POST", "/v1/auth/sign-in/provider", {
    provider: "google",
    callback_url: "http://localhost:3000/sign-in",
  });
  assert.equal(started.status, 200, started.text);

  const url = String(started.body?.authorization_url);
  assert.match(url, /^https:\/\/accounts\.google\.com\//);
  assert.ok(url.includes(encodeURIComponent(STUB_GOOGLE.clientId)) || url.includes(STUB_GOOGLE.clientId));
  assert.match(String(started.body?.state_cookie), /state=/);
});

test("a callback with an altered state is refused and creates nothing", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const refused = await apiRequest(stack, "POST", "/v1/auth/provider/callback", {
    provider: "google",
    code: "stub-code",
    state: "stub-state",
    state_cookie: "better-auth.state=tampered-value",
  });
  assert.equal(refused.status, 401, refused.text);

  const users = await stack.client.query("SELECT count(*)::int AS count FROM users");
  assert.equal(users.rows[0].count, 0, "no account is created by a refused callback");
  const sessions = await stack.client.query("SELECT count(*)::int AS count FROM sessions");
  assert.equal(sessions.rows[0].count, 0);
});

test("a callback missing its parameters is a validation error", async (t) => {
  const stack = requireStacks(t);
  if (!stack) return;

  const refused = await apiRequest(stack, "POST", "/v1/auth/provider/callback", {
    provider: "google",
    code: "",
    state: "",
    state_cookie: "",
  });
  assert.equal(refused.status, 422, refused.text);
});
