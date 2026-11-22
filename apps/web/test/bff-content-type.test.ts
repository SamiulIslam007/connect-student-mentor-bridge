import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as forgotPassword } from "../app/api/auth/forgot-password/route.js";
import { POST as register } from "../app/api/auth/register/route.js";
import { POST as resetPassword } from "../app/api/auth/reset-password/route.js";
import { POST as signInProvider } from "../app/api/auth/sign-in/provider/route.js";
import { POST as signIn } from "../app/api/auth/sign-in/route.js";

/**
 * SEC-AUDIT-004: a cross-site `fetch` with `Content-Type: text/plain` is a simple
 * request (no preflight) and carries valid JSON. The five pre-session writes are
 * CSRF-exempt by design, so the content type is the only thing that stops it.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubUpstream(payload: unknown, status = 200): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const ROUTES = [
  {
    name: "sign-in",
    handler: signIn,
    body: { email: "student@example.com", password: "a long password" },
  },
  { name: "sign-in/provider", handler: signInProvider, body: { provider: "google" } },
  {
    name: "register",
    handler: register,
    body: {
      display_name: "Student",
      email: "student@example.com",
      password: "a long password",
      date_of_birth: "2000-01-01",
      consent_accepted: true,
    },
  },
  { name: "forgot-password", handler: forgotPassword, body: { email: "student@example.com" } },
  {
    name: "reset-password",
    handler: resetPassword,
    body: { token: "a-reset-token", password: "a long password" },
  },
];

function post(
  route: (typeof ROUTES)[number],
  contentType: string,
): Request {
  return new Request(`http://localhost:3000/api/auth/${route.name}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(route.body),
  });
}

for (const route of ROUTES) {
  test(`${route.name} refuses text/plain before any upstream call`, async () => {
    const calls = stubUpstream({ status: "should-not-be-used" });

    const response = await route.handler(post(route, "text/plain"));
    const payload = (await response.json()) as { code?: string };

    assert.equal(response.status, 415, `${route.name} must answer 415, not parse the body`);
    assert.equal(payload.code, "UNSUPPORTED_MEDIA_TYPE");
    assert.deepEqual(calls, [], `${route.name} must not reach the API`);
  });

  test(`${route.name} still accepts an application/json body`, async () => {
    stubUpstream({ status: "accepted" });

    const response = await route.handler(post(route, "application/json"));

    assert.notEqual(response.status, 415, `${route.name} must keep working for the browser`);
  });
}

test("a charset parameter and a structured +json type are JSON too", async () => {
  stubUpstream({ status: "accepted" });

  const withCharset = await signIn(post(ROUTES[0], "application/json; charset=utf-8"));
  assert.notEqual(withCharset.status, 415);

  const structured = await signIn(post(ROUTES[0], "application/merge-patch+json"));
  assert.notEqual(structured.status, 415);

  const textJson = await signIn(post(ROUTES[0], "text/application+json"));
  assert.equal(textJson.status, 415, "only the application type family is JSON");
});
