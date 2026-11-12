import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as breakGlass } from "../app/api/admin/mentorships/break-glass/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface UpstreamCall {
  url: string;
  body: string | null;
}

function stubFetch(payload: unknown, status = 200, calls: UpstreamCall[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: typeof init?.body === "string" ? init.body : null });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/mentorships/break-glass", {
    method: "POST",
    headers: { cookie: "connect_session=session-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("the route forwards to the break-glass read with the session header", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ mentorship_id: "m-1", messages: [] }, 200, calls);

  const response = await breakGlass(request({ mentorship_id: "m-1", reason: "the report names it" }));

  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/admin\/mentorships\/m-1\/break-glass-read$/);
  assert.equal(response.headers.get("cache-control"), "no-store", "a moderation read is not cacheable");
  // The upstream body carries the reason only: the API's allowlist documents
  // exactly one key for this route, and the id already forms the path.
  assert.deepEqual(JSON.parse(String(calls[0].body)), { reason: "the report names it" });
});

test("no session cookie is a refusal before any upstream call", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await breakGlass(
    new Request("http://localhost:3000/api/admin/mentorships/break-glass", {
      method: "POST",
      body: JSON.stringify({ mentorship_id: "m-1", reason: "why" }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("a missing mentorship id is refused here, not upstream", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await breakGlass(request({ reason: "why" }));

  assert.equal(response.status, 422);
  assert.equal(calls.length, 0);
});

test("a refusal keeps its status and code", async () => {
  for (const [status, code] of [
    [403, "MFA_REQUIRED"],
    [404, "NOT_FOUND"],
    [422, "VALIDATION_FAILED"],
  ] as const) {
    stubFetch({ code }, status);
    const response = await breakGlass(request({ mentorship_id: "m-1", reason: "why" }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
});

test("a non-JSON upstream becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await breakGlass(request({ mentorship_id: "m-1", reason: "why" }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
