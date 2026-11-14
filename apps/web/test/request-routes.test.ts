import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getMentor } from "../app/api/mentors/[id]/route.js";
import { POST as act } from "../app/api/requests/[id]/[action]/route.js";
import { GET as listRequests, POST as createRequest } from "../app/api/requests/route.js";

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

function params(id: string, action: string) {
  return { params: Promise.resolve({ id, action }) };
}

test("POST /api/requests forwards the session and body", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "req-1", status: "pending" }, 201, calls);

  const response = await createRequest(request("/api/requests", "POST", { mentor_id: "m-1" }));

  assert.equal(response.status, 201);
  assert.match(calls[0].url, /\/v1\/requests$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { mentor_id: "m-1" });
});

test("a 409 refusal reaches the page with its code", async () => {
  stubFetch({ code: "MENTOR_AT_CAPACITY", detail: "at capacity" }, 409);

  const response = await createRequest(request("/api/requests", "POST", { mentor_id: "m-1" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MENTOR_AT_CAPACITY");
});

test("GET /api/requests forwards the query", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await listRequests(request("/api/requests?role=received&limit=5", "GET"));
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/requests\?role=received&limit=5$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("accept and withdraw forward no body; decline forwards the reason", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ status: "accepted" }, 200, calls);

  await act(request("/api/requests/req-1/accept", "POST"), params("req-1", "accept"));
  assert.match(calls[0].url, /\/v1\/requests\/req-1\/accept$/);
  assert.equal(calls[0].body, undefined);

  await act(
    request("/api/requests/req-1/decline", "POST", { reason: "Out of scope" }),
    params("req-1", "decline"),
  );
  assert.deepEqual(JSON.parse(String(calls[1].body)), { reason: "Out of scope" });

  await act(request("/api/requests/req-1/withdraw", "POST"), params("req-1", "withdraw"));
  assert.equal(calls[2].body, undefined);
});

test("an unknown action is a local 404 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await act(request("/api/requests/req-1/delete", "POST"), params("req-1", "delete"));
  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test("GET /api/mentors/{id} forwards the session", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "m-1", access_mode: "OPEN" }, 200, calls);

  const response = await getMentor(request("/api/mentors/m-1", "GET"), {
    params: Promise.resolve({ id: "m-1" }),
  });
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/mentors\/m-1$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("request routes without a session are 401 and call nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const anonymous = new Request("http://localhost:3000/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  for (const response of [
    await createRequest(anonymous),
    await listRequests(new Request("http://localhost:3000/api/requests")),
    await act(new Request("http://localhost:3000/api/requests/x/accept", { method: "POST" }), params("x", "accept")),
    await getMentor(new Request("http://localhost:3000/api/mentors/x"), { params: Promise.resolve({ id: "x" }) }),
  ]) {
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});
