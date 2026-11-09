import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as listMentors } from "../app/api/mentors/route.js";

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

function anonymousRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`);
}

test("the directory route forwards only the documented filters", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [], next_cursor: null }, 200, calls);

  const response = await listMentors(
    anonymousRequest(
      "/api/mentors?field=field-1&language=EN&access_state=full&cursor=mentor-1&limit=5&role=admin",
    ),
  );

  assert.equal(response.status, 200);
  assert.match(
    calls[0].url,
    /\/v1\/mentors\?field=field-1&language=EN&access_state=full&cursor=mentor-1&limit=5$/,
  );
  assert.equal(calls[0].authorization, null, "the public read must not forward a session");
});

test("an empty query forwards the bare path", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [], next_cursor: null }, 200, calls);

  await listMentors(anonymousRequest("/api/mentors"));
  assert.match(calls[0].url, /\/v1\/mentors$/);
});

test("a refusal status reaches the page with its code", async () => {
  stubFetch({ code: "VALIDATION_FAILED", title: "Request validation failed" }, 422);

  const response = await listMentors(anonymousRequest("/api/mentors?limit=0"));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "VALIDATION_FAILED");
});

test("a non-JSON upstream becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await listMentors(anonymousRequest("/api/mentors"));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
