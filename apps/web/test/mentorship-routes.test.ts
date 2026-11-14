import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getMentorship } from "../app/api/mentorships/[[...path]]/route.js";
import {
  POST as postMentorship,
  PUT as putMentorship,
} from "../app/api/mentorships/[[...path]]/route.js";
import { POST as postSession } from "../app/api/sessions/[[...path]]/route.js";

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

function stubNonJson(status = 200): void {
  globalThis.fetch = (async () =>
    new Response("<html>proxy error</html>", {
      status,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
}

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function withSession(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
  });
}

function params(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

test("GET /api/mentorships forwards the session and the query", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await getMentorship(withSession("/api/mentorships?status=active"), params());
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/mentorships\?status=active$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("GET /api/mentorships/{id}/messages forwards the cursor", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [], next_cursor: null }, 200, calls);

  const response = await getMentorship(
    withSession(
      "/api/mentorships/m-1/messages?limit=5&cursor=1%7C00000000-0000-0000-0000-000000000000",
    ),
    params("m-1", "messages"),
  );
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/mentorships\/m-1\/messages\?limit=5&cursor=/);
});

test("POST and PUT forward the body to the matching API path", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "msg-1" }, 201, calls);

  await postMentorship(request("/api/mentorships/m-1/messages", "POST", { body: "Hello" }), params("m-1", "messages"));
  assert.match(calls[0].url, /\/v1\/mentorships\/m-1\/messages$/);
  assert.deepEqual(JSON.parse(String(calls[0].body)), { body: "Hello" });

  await putMentorship(
    request("/api/mentorships/m-1/agreement", "PUT", { cadence: "WEEKLY" }),
    params("m-1", "agreement"),
  );
  assert.match(calls[1].url, /\/v1\/mentorships\/m-1\/agreement$/);
  assert.equal(calls[1].method, "PUT");
});

test("session actions forward to the sessions surface", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ status: "held" }, 200, calls);

  await postSession(
    request("/api/sessions/s-1/confirm-held", "POST"),
    params("s-1", "confirm-held"),
  );
  assert.match(calls[0].url, /\/v1\/sessions\/s-1\/confirm-held$/);

  await postSession(request("/api/sessions/s-1/cancel", "POST", { reason: "Moved" }), params("s-1", "cancel"));
  assert.match(calls[1].url, /\/v1\/sessions\/s-1\/cancel$/);
});

test("an unknown mentorship or session path is a local 404 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  for (const response of [
    await getMentorship(withSession("/api/mentorships/m-1/delete"), params("m-1", "delete")),
    await postMentorship(request("/api/mentorships/m-1/withdraw", "POST", {}), params("m-1", "withdraw")),
    await postSession(request("/api/sessions/s-1/delete", "POST", {}), params("s-1", "delete")),
  ]) {
    assert.equal(response.status, 404);
  }
  assert.equal(calls.length, 0);
});

test("routes without a session are 401 and call nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  for (const response of [
    await getMentorship(new Request("http://localhost:3000/api/mentorships"), params()),
    await postMentorship(
      new Request("http://localhost:3000/api/mentorships/m-1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Hello" }),
      }),
      params("m-1", "messages"),
    ),
    await postSession(
      new Request("http://localhost:3000/api/sessions/s-1/confirm-held", { method: "POST" }),
      params("s-1", "confirm-held"),
    ),
  ]) {
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});

test("a non-JSON upstream answer becomes a 502 problem", async () => {
  stubNonJson(200);

  const response = await getMentorship(
    new Request("http://localhost:3000/api/mentorships/m-1", {
      headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
    }),
    params("m-1"),
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
