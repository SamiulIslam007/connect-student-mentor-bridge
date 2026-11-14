import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getAvailability, PUT as saveAvailability } from "../app/api/me/availability/route.js";
import { POST as pause } from "../app/api/me/mentor-profile/pause/route.js";
import { POST as resume } from "../app/api/me/mentor-profile/resume/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface UpstreamCall {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
}

function stubFetch(payload: unknown, status: number, calls: UpstreamCall[]): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const COOKIE = { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" };

test("availability reads forward the context and the session", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ context: "MENTOR", windows: [] }, 200, calls);

  const response = await getAvailability(
    new Request("http://localhost:3000/api/me/availability?context=MENTOR", { headers: COOKIE }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls[0]?.url, "http://localhost:3001/v1/me/availability?context=MENTOR");
  assert.match(String(calls[0]?.authorization), /^Bearer opaque-session-token$/);
});

test("availability reads without a session do not call the API", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await getAvailability(
    new Request("http://localhost:3000/api/me/availability?context=STUDENT"),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("an availability save forwards the body and passes a 422 through", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ code: "VALIDATION_FAILED", detail: "windows overlap on weekday 1" }, 422, calls);

  const response = await saveAvailability(
    new Request("http://localhost:3000/api/me/availability", {
      method: "PUT",
      headers: { ...COOKIE, "content-type": "application/json" },
      body: JSON.stringify({ context: "STUDENT", windows: [] }),
    }),
  );

  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "VALIDATION_FAILED");
  assert.equal(calls[0]?.method, "PUT");
  assert.equal(calls[0]?.body, JSON.stringify({ context: "STUDENT", windows: [] }));
});

test("pause is a bodiless POST and resume forwards its mode", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ access_mode: "PAUSED" }, 200, calls);

  await pause(new Request("http://localhost:3000/api/me/mentor-profile/pause", {
    method: "POST",
    headers: COOKIE,
  }));
  await resume(
    new Request("http://localhost:3000/api/me/mentor-profile/resume", {
      method: "POST",
      headers: { ...COOKIE, "content-type": "application/json" },
      body: JSON.stringify({ access_mode: "APPLICATION_ONLY" }),
    }),
  );

  assert.equal(calls[0]?.url, "http://localhost:3001/v1/me/mentor-profile/pause");
  assert.equal(calls[0]?.body, null);
  assert.equal(calls[1]?.url, "http://localhost:3001/v1/me/mentor-profile/resume");
  assert.equal(calls[1]?.body, JSON.stringify({ access_mode: "APPLICATION_ONLY" }));
});

test("pause without a session is refused without an upstream call", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  const response = await pause(
    new Request("http://localhost:3000/api/me/mentor-profile/pause", { method: "POST" }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
