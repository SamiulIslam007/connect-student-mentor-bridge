import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as listQueue } from "../app/api/review-queue/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(path: string, withSession = true): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: withSession ? { cookie: "connect_session=opaque-session-token" } : {},
  });
}

function stubFetch(payload: unknown, status = 200, calls: { url: string; authorization: string | null }[] = []): void {
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

test("the queue route forwards the session and the page keys", async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  stubFetch({ data: [], next_cursor: null }, 200, calls);

  const response = await listQueue(request("/api/review-queue?limit=10&cursor=outcome-1"));
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/review-queue\?cursor=outcome-1&limit=10$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("no session is a local 401 and calls nothing", async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  stubFetch({}, 200, calls);

  const response = await listQueue(request("/api/review-queue", false));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("a 403 MFA_REQUIRED reaches the page unchanged", async () => {
  stubFetch({ code: "MFA_REQUIRED", title: "Second factor required" }, 403);

  const response = await listQueue(request("/api/review-queue"));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "MFA_REQUIRED");
});
