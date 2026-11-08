import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as claimAffiliation } from "../app/api/me/affiliations/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface UpstreamCall {
  url: string;
  method: string;
  authorization: string | null;
  body: string | undefined;
}

function stubFetch(payload: unknown, status = 200, calls: UpstreamCall[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function sessionRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/me/affiliations", {
    method: "POST",
    headers: {
      cookie: "connect_session=opaque-session-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("POST /api/me/affiliations forwards the cookie as a bearer token", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch(
    { affiliation: { id: "aff-1", status: "verified", level: "level_1" }, level: "level_1" },
    200,
    calls,
  );

  const response = await claimAffiliation(sessionRequest({ kind: "STUDENT" }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/me\/affiliations$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { kind: "STUDENT" });
  assert.equal((await response.json()).level, "level_1");
});

test("a 422 problem body reaches the page unchanged", async () => {
  stubFetch(
    { code: "AFFILIATION_EMAIL_UNVERIFIED", detail: "confirm your email address" },
    422,
  );

  const response = await claimAffiliation(sessionRequest({ kind: "STUDENT" }));

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.code, "AFFILIATION_EMAIL_UNVERIFIED");
  assert.equal(payload.detail, "confirm your email address");
});

test("a claim without a session is 401 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await claimAffiliation(
    new Request("http://localhost:3000/api/me/affiliations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "STUDENT" }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
