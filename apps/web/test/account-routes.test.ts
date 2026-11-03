import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getAccount } from "../app/api/me/route.js";
import { POST as deactivate } from "../app/api/me/deactivate/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface UpstreamCall {
  url: string;
  authorization: string | null;
}

function stubFetch(payload: unknown, status = 200, calls: UpstreamCall[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("GET /api/me forwards the session cookie to the API and returns the account", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "user-1", account_status: "active" }, 200, calls);

  const response = await getAccount(
    new Request("http://localhost:3000/api/me", {
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/me$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");

  const text = await response.text();
  assert.ok(!text.includes("opaque-session-token"), "the token never reaches the browser");
});

test("GET /api/me without a session is 401 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "should-not-be-used" }, 200, calls);

  const response = await getAccount(new Request("http://localhost:3000/api/me"));

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("POST /api/me/deactivate revokes the session server-side and clears the cookie", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ status: "deactivated" }, 200, calls);

  const response = await deactivate(
    new Request("http://localhost:3000/api/me/deactivate", {
      method: "POST",
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/me\/deactivate$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  assert.match(response.headers.get("set-cookie") ?? "", /connect_session=;/);
  assert.deepEqual(JSON.parse(await response.text()), { status: "deactivated" });
});

test("POST /api/me/deactivate without a session is 401 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ status: "should-not-be-used" }, 200, calls);

  const response = await deactivate(
    new Request("http://localhost:3000/api/me/deactivate", { method: "POST" }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
