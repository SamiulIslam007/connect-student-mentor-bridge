import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as signIn } from "../app/api/auth/sign-in/route.js";
import { POST as verifyMfa } from "../app/api/auth/mfa/verify/route.js";
import { GET as listSessions } from "../app/api/me/sessions/route.js";
import { GET as providerCallback } from "../app/callback/google/route.js";
import { DELETE as revokeSession } from "../app/api/me/sessions/[id]/route.js";
import { mfaCookieOptions, readMfaCookie, MFA_COOKIE_NAME } from "../lib/mfa-cookie.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(payload: unknown, status = 200, calls: string[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("the flow cookie is httpOnly, SameSite=Lax, and short-lived", () => {
  const development = mfaCookieOptions(false);
  assert.equal(development.httpOnly, true);
  assert.equal(development.sameSite, "lax");
  assert.equal(development.secure, false);
  assert.equal(development.maxAge, 600);
  assert.equal(mfaCookieOptions(true).secure, true);
  assert.equal(readMfaCookie(`${MFA_COOKIE_NAME}=abc%3Ddef`), "abc=def");
  assert.equal(readMfaCookie("other=1"), null);
});

test("a challenged sign-in stores the challenge and returns no token", async () => {
  stubFetch({ mfa_required: true, mfa_challenge: "better-auth.two_factor=2fa-abc.sig" });

  const response = await signIn(
    new Request("http://localhost:3000/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@example.com", password: "a long password" }),
    }),
  );

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`${MFA_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.ok(!setCookie.includes("connect_session="), "no session cookie is set by a challenge");

  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { status: "mfa_required" });
  assert.ok(!text.includes("2fa-abc"), "the challenge never reaches client JavaScript");
});

test("verification posts the stored challenge and replaces it with a session", async () => {
  const calls: string[] = [];
  stubFetch({ session_token: "opaque-session-token", account_status: "active" }, 200, calls);

  const response = await verifyMfa(
    new Request("http://localhost:3000/api/auth/mfa/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${MFA_COOKIE_NAME}=better-auth.two_factor%3D2fa-abc.sig`,
      },
      body: JSON.stringify({ code: "123456" }),
    }),
  );

  assert.equal(calls.length, 1);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /connect_session=opaque-session-token/);
  assert.match(setCookie, new RegExp(`${MFA_COOKIE_NAME}=`), "the challenge cookie is cleared");

  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { status: "signed_in" });
  assert.ok(!text.includes("opaque-session-token"));
});

test("verification without a session or a challenge is 401 and calls nothing", async () => {
  const calls: string[] = [];
  stubFetch({}, 200, calls);

  const response = await verifyMfa(
    new Request("http://localhost:3000/api/auth/mfa/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("the session list forwards the cookie and returns no token", async () => {
  stubFetch({ data: [{ id: "session-1", current: true }] });

  const response = await listSessions(
    new Request("http://localhost:3000/api/me/sessions", {
      headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
    }),
  );

  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes("opaque-session-token"));
  assert.deepEqual(JSON.parse(text), { data: [{ id: "session-1", current: true }] });
});

test("revoking a session translates the API 204 into a bodiless 204", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;

  const response = await revokeSession(
    new Request("http://localhost:3000/api/me/sessions/session-1", {
      method: "DELETE",
      headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
    }),
    { params: Promise.resolve({ id: "session-1" }) },
  );

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("revoking without a session calls nothing", async () => {
  const calls: string[] = [];
  stubFetch({}, 200, calls);

  const response = await revokeSession(
    new Request("http://localhost:3000/api/me/sessions/session-1", { method: "DELETE" }),
    { params: Promise.resolve({ id: "session-1" }) },
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("the provider callback stores the session cookie and clears the state cookie", async () => {
  const calls: string[] = [];
  stubFetch({ session_token: "opaque-session-token", account: { id: "user-1" } }, 200, calls);

  const response = await providerCallback(
    new Request("http://localhost:3000/callback/google?code=stub-code&state=stub-state", {
      headers: { cookie: "connect_oauth_state=better-auth.state%3Dabc" },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(response.status, 307);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /connect_session=opaque-session-token/);
  assert.match(setCookie, /connect_oauth_state=/, "the state cookie is cleared");
});

test("a provider callback without the state cookie is redirected back and calls nothing", async () => {
  const calls: string[] = [];
  stubFetch({}, 200, calls);

  const response = await providerCallback(
    new Request("http://localhost:3000/callback/google?code=stub-code&state=stub-state"),
  );

  assert.equal(response.status, 307);
  assert.match(String(response.headers.get("location")), /error=provider/);
  assert.equal(calls.length, 0);
});
