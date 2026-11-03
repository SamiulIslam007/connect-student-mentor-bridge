import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as register } from "../app/api/auth/register/route.js";
import { POST as signIn } from "../app/api/auth/sign-in/route.js";
import { POST as signOutEverywhere } from "../app/api/auth/sign-out-everywhere/route.js";
import { GET as verify } from "../app/api/auth/verify/route.js";
import { GET as getMe } from "../app/api/me/route.js";
import { BFF_MAX_BODY_BYTES } from "../lib/bff.js";
import { readSessionCookie, sessionCookieOptions } from "../lib/session-cookie.js";

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

test("a rejected session clears the cookie instead of leaving a dead token", async () => {
  stubFetch({ code: "UNAUTHENTICATED" }, 401);

  const response = await signOutEverywhere(
    new Request("http://localhost:3000/api/auth/sign-out-everywhere", {
      method: "POST",
      headers: { cookie: "connect_session=dead-token" },
    }),
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") ?? "", /connect_session=;/);
});

test("an unreachable API returns a problem response instead of throwing", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  const response = await register(
    new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Student", email: "s@example.com" }),
    }),
  );

  assert.equal(response.status, 502);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, "INTERNAL_ERROR");
});

test("the verify redirect uses the configured origin and ignores spoofed headers", async () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  try {
    stubFetch({ status: "verified" }, 200);
    const response = await verify(
      new Request("http://localhost:3000/api/auth/verify?token=opaque", {
        headers: {
          host: "evil.example",
          "x-forwarded-proto": "javascript",
          "x-forwarded-host": "evil.example",
        },
      }),
    );

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/verify?status=verified");
  } finally {
    if (previous === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previous;
    }
  }
});

test("the verify redirect maps a rejected token and a server fault to distinct statuses", async () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://app.example";
  try {
    stubFetch({ code: "INVALID_VERIFICATION_LINK" }, 400);
    const invalid = await verify(new Request("http://localhost:3000/api/auth/verify?token=bad"));
    assert.equal(invalid.headers.get("location"), "https://app.example/verify?status=invalid");

    stubFetch({ title: "Unexpected error" }, 500);
    const failed = await verify(new Request("http://localhost:3000/api/auth/verify?token=broken"));
    assert.equal(failed.headers.get("location"), "https://app.example/verify?status=error");
  } finally {
    if (previous === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previous;
    }
  }
});

test("a declared body over the cap is refused before the API is called", async () => {
  const calls: string[] = [];
  stubFetch({ status: "should-not-be-used" }, 200, calls);

  const body = JSON.stringify({
    display_name: "x".repeat(200 * 1024),
    email: "student@example.com",
  });
  const response = await register(
    new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      body,
    }),
  );

  assert.equal(response.status, 413);
  const payload = (await response.json()) as { code?: string };
  assert.equal(payload.code, "PAYLOAD_TOO_LARGE");
  assert.equal(calls.length, 0, "the API was not called");
});

test("a chunked body without a Content-Length is counted and refused at the cap", async () => {
  const calls: string[] = [];
  stubFetch({ status: "should-not-be-used" }, 200, calls);

  const chunk = new Uint8Array(16 * 1024).fill(65);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= 200 * 1024) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
  const request = new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);

  const response = await register(request);
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
  assert.ok(BFF_MAX_BODY_BYTES < 200 * 1024);
});

test("a malformed session cookie is treated as no session", async () => {
  const calls: string[] = [];
  stubFetch({ id: "should-not-be-used" }, 200, calls);

  const response = await getMe(
    new Request("http://localhost:3000/api/me", {
      headers: { cookie: "connect_session=%" },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
  assert.equal(readSessionCookie("connect_session=%"), null);
  assert.equal(readSessionCookie("connect_session=ok%20token"), "ok token");
});

test("a non-JSON upstream error becomes a 502 problem body", async () => {
  globalThis.fetch = (async () =>
    new Response("<html><body>proxy error</body></html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await register(
    new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Student", email: "s@example.com" }),
    }),
  );

  assert.equal(response.status, 502);
  const text = await response.text();
  const payload = JSON.parse(text) as { code?: string };
  assert.equal(payload.code, "INTERNAL_ERROR");
  assert.ok(!text.includes("<html>"), "the HTML is not passed through");
});

test("an empty successful upstream body is not reported as success", async () => {
  globalThis.fetch = (async () => new Response("", { status: 200 })) as typeof fetch;

  const response = await register(
    new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Student", email: "s@example.com" }),
    }),
  );

  assert.equal(response.status, 502);
  const payload = (await response.json()) as { code?: string };
  assert.equal(payload.code, "INTERNAL_ERROR");
});

test("a non-JSON body from the account endpoint is a 502, not an empty account", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await getMe(
    new Request("http://localhost:3000/api/me", {
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("<html>"));
});
