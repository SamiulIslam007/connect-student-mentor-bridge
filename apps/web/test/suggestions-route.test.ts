import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as listSuggestions } from "../app/api/suggestions/route.js";

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

function signedInRequest(): Request {
  return new Request("http://localhost:3000/api/suggestions", {
    headers: { cookie: "connect_session=session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
  });
}

test("the route forwards to the suggestion read with the session header", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await listSuggestions(signedInRequest());
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/suggestions$/);
  assert.equal(calls[0].authorization, "Bearer session-token");
});

test("no session cookie is a refusal before any upstream call", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await listSuggestions(new Request("http://localhost:3000/api/suggestions"));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("an upstream refusal keeps its status and code", async () => {
  stubFetch({ code: "STUDENT_PROFILE_REQUIRED" }, 422);

  const response = await listSuggestions(signedInRequest());
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "STUDENT_PROFILE_REQUIRED");
});

test("a non-JSON upstream becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await listSuggestions(signedInRequest());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
