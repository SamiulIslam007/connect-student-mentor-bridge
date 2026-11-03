import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as register } from "../app/api/auth/register/route.js";
import { POST as signIn } from "../app/api/auth/sign-in/route.js";
import { POST as signOutEverywhere } from "../app/api/auth/sign-out-everywhere/route.js";
import { sessionCookieOptions } from "../lib/session-cookie.js";

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

test("the session cookie is httpOnly and SameSite=Lax, Secure outside development", () => {
  const development = sessionCookieOptions(false);
  assert.equal(development.httpOnly, true);
  assert.equal(development.sameSite, "lax");
  assert.equal(development.secure, false);
  assert.equal(development.path, "/");

  assert.equal(sessionCookieOptions(true).secure, true);
});

test("sign-in sets the cookie and never returns the token in the body", async () => {
  stubFetch({ session_token: "opaque-session-token", account: { id: "user-1" } });

  const response = await signIn(
    new Request("http://localhost:3000/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@example.com", password: "a long password" }),
    }),
  );

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /connect_session=opaque-session-token/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.match(setCookie, /Path=\//);

  const text = await response.text();
  assert.ok(!text.includes("opaque-session-token"), "the token must not reach client JavaScript");
  assert.deepEqual(JSON.parse(text), { status: "signed_in" });
});

test("a failed sign-in passes the problem through and sets no cookie", async () => {
  stubFetch({ code: "UNAUTHENTICATED", title: "Authentication failed" }, 401);

  const response = await signIn(
    new Request("http://localhost:3000/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@example.com", password: "wrong" }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("registration is proxied to the API with no session cookie", async () => {
  const calls: string[] = [];
  stubFetch({ status: "verification_sent" }, 200, calls);

  const response = await register(
    new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: "Student",
        email: "student@example.com",
        password: "a long password",
        date_of_birth: "2000-01-01",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/v1\/auth\/register$/);
});

test("sign-out-everywhere uses the session cookie and clears it", async () => {
  const calls: string[] = [];
  stubFetch({ status: "signed_out_everywhere" }, 200, calls);

  const response = await signOutEverywhere(
    new Request("http://localhost:3000/api/auth/sign-out-everywhere", {
      method: "POST",
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endsWith("/v1/auth/sign-out-everywhere"), true);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /connect_session=;/);
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
});

test("sign-out-everywhere without a cookie is 401 and calls nothing", async () => {
  const calls: string[] = [];
  stubFetch({ status: "should-not-be-used" }, 200, calls);

  const response = await signOutEverywhere(
    new Request("http://localhost:3000/api/auth/sign-out-everywhere", { method: "POST" }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
