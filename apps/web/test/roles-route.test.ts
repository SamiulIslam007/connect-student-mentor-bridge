import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as grantMentor } from "../app/api/me/roles/mentor/route.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface UpstreamCall {
  url: string;
  authorization: string | null;
}

function stubFetch(payload: unknown, status: number, calls: UpstreamCall[]): void {
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

test("the mentor opt-in forwards the session and returns the caller's roles", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ roles: ["STUDENT", "MENTOR"] }, 200, calls);

  const response = await grantMentor(
    new Request("http://localhost:3000/api/me/roles/mentor", {
      method: "POST",
      headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { roles: ["STUDENT", "MENTOR"] });
  assert.equal(calls[0]?.url, "http://localhost:3001/v1/me/roles/mentor");
  assert.match(String(calls[0]?.authorization), /^Bearer opaque-session-token$/);
});

test("a visitor without a session is refused without calling the API", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ roles: [] }, 200, calls);

  const response = await grantMentor(
    new Request("http://localhost:3000/api/me/roles/mentor", { method: "POST" }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("an upstream refusal passes its status and code through", async () => {
  stubFetch({ code: "ROLE_REQUIRED", status: 403 }, 403, []);

  const response = await grantMentor(
    new Request("http://localhost:3000/api/me/roles/mentor", {
      method: "POST",
      headers: { cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token" },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ROLE_REQUIRED");
});
