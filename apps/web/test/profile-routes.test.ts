import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getFields } from "../app/api/fields/route.js";
import { PUT as saveMentorProfile } from "../app/api/me/mentor-profile/route.js";
import { PUT as saveStudentProfile } from "../app/api/me/student-profile/route.js";

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

function sessionRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      cookie: "connect_session=opaque-session-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("PUT /api/me/student-profile forwards the cookie with PUT and passes the status through", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ code: "VALIDATION_FAILED", detail: "goals is required" }, 422, calls);

  const response = await saveStudentProfile(
    sessionRequest("/api/me/student-profile", "PUT", { goals: "", primary_field: "AI" }),
  );

  assert.equal(response.status, 422);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/me\/student-profile$/);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { goals: "", primary_field: "AI" });

  const payload = JSON.parse(await response.text());
  assert.equal(payload.detail, "goals is required", "the problem detail reaches the page");
});

test("PUT /api/me/mentor-profile forwards the cookie with PUT", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ weekly_capacity: 2 }, 200, calls);

  const response = await saveMentorProfile(
    sessionRequest("/api/me/mentor-profile", "PUT", { weekly_capacity: 2 }),
  );

  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/me\/mentor-profile$/);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("profile saves without a session are 401 and call nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ should: "not be called" }, 200, calls);

  const student = await saveStudentProfile(
    new Request("http://localhost:3000/api/me/student-profile", { method: "PUT" }),
  );
  const mentor = await saveMentorProfile(
    new Request("http://localhost:3000/api/me/mentor-profile", { method: "PUT" }),
  );

  assert.equal(student.status, 401);
  assert.equal(mentor.status, 401);
  assert.equal(calls.length, 0);
});

test("GET /api/fields forwards the cookie and returns the taxonomy", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ fields: [{ id: "field-1", name: "Data science" }] }, 200, calls);

  const response = await getFields(
    new Request("http://localhost:3000/api/fields", {
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/fields$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
  assert.deepEqual(await response.json(), {
    fields: [{ id: "field-1", name: "Data science" }],
  });
});

test("GET /api/fields forwards limit and cursor to the API", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ fields: [], next_cursor: null }, 200, calls);

  const response = await getFields(
    new Request("http://localhost:3000/api/fields?limit=2&cursor=beta", {
      headers: { cookie: "connect_session=opaque-session-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/fields\?limit=2&cursor=beta$/);
  assert.deepEqual(await response.json(), { fields: [], next_cursor: null });
});

test("GET /api/fields without a session is 401 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ fields: [] }, 200, calls);

  const response = await getFields(new Request("http://localhost:3000/api/fields"));

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
