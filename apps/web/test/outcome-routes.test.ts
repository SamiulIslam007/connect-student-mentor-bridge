import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as getOutcomes, POST as postOutcome } from "../app/api/outcomes/[[...path]]/route.js";

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

function withSession(path: string, method = "GET", body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      cookie: "connect_session=opaque-session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

test("GET /api/outcomes forwards the session and the mentorship filter", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await getOutcomes(withSession("/api/outcomes?mentorship_id=m-1"), params());
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/outcomes\?mentorship_id=m-1$/);
  assert.equal(calls[0].authorization, "Bearer opaque-session-token");
});

test("a report is forwarded with its body", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "o-1", status: "pending_confirmation" }, 201, calls);

  const response = await postOutcome(
    withSession("/api/outcomes", "POST", { mentorship_id: "m-1", description: "Offer" }),
    params(),
  );
  assert.equal(response.status, 201);
  assert.match(calls[0].url, /\/v1\/outcomes$/);
  assert.deepEqual(JSON.parse(String(calls[0].body)), { mentorship_id: "m-1", description: "Offer" });
});

test("confirm, dispute and withdraw map to their API paths", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ status: "confirmed" }, 200, calls);

  await postOutcome(
    withSession("/api/outcomes/o-1/confirm", "POST", { contribution_level_confirmed: "HELPED" }),
    params("o-1", "confirm"),
  );
  assert.match(calls[0].url, /\/v1\/outcomes\/o-1\/confirm$/);

  await postOutcome(
    withSession("/api/outcomes/o-1/dispute", "POST", { reason: "Not mine" }),
    params("o-1", "dispute"),
  );
  assert.match(calls[1].url, /\/v1\/outcomes\/o-1\/dispute$/);

  // A withdrawal carries no body at all.
  await postOutcome(withSession("/api/outcomes/o-1/withdraw", "POST"), params("o-1", "withdraw"));
  assert.match(calls[2].url, /\/v1\/outcomes\/o-1\/withdraw$/);
  assert.equal(calls[2].body, undefined);
});

test("an unknown outcome path is a local 404 and calls nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  for (const response of [
    await getOutcomes(withSession("/api/outcomes/o-1/delete"), params("o-1", "delete")),
    await postOutcome(withSession("/api/outcomes/o-1/count", "POST", {}), params("o-1", "count")),
  ]) {
    assert.equal(response.status, 404);
  }
  assert.equal(calls.length, 0);
});

test("outcome routes without a session are 401 and call nothing", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({}, 200, calls);

  for (const response of [
    await getOutcomes(new Request("http://localhost:3000/api/outcomes"), params()),
    await postOutcome(
      new Request("http://localhost:3000/api/outcomes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      params(),
    ),
  ]) {
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});

test("a non-JSON upstream answer becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>oops</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await getOutcomes(withSession("/api/outcomes/o-1"), params("o-1"));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
