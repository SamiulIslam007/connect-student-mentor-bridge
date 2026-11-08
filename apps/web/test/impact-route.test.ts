import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getImpact } from "../app/api/me/impact/route.js";

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

function withSession(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { cookie: "connect_session=opaque-session-token" },
  });
}

test("GET /api/me/impact forwards the session and keeps counts only", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [{ field_id: "f-1", field_name: "Engineering", outcome_type: "internship", count: 2 }], counted_outcomes: 2 }, 200, calls);

  const response = await getImpact(withSession("/api/me/impact"));
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/me\/impact$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["counted_outcomes", "data"]);
  for (const forbidden of ["score", "points", "tier", "ranking"]) {
    assert.equal(forbidden in body, false);
  }
});

test("a visitor without a session is refused without calling the API", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await getImpact(new Request("http://localhost:3000/api/me/impact"));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("an upstream refusal passes its status through", async () => {
  stubFetch({ code: "UNAUTHENTICATED" }, 401);

  const response = await getImpact(withSession("/api/me/impact"));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHENTICATED");
});

test("a non-JSON upstream answer becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>oops</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await getImpact(withSession("/api/me/impact"));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
