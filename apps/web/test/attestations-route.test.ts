import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET as listClaims } from "../app/api/institution/attestations/route.js";
import { POST as decideClaim } from "../app/api/institution/attestations/[id]/decide/route.js";

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

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { cookie: "connect_session=session-token; connect_csrf=csrf-token", "x-csrf-token": "csrf-token", ...(init.headers ?? {}) },
  });
}

test("the queue route forwards to the institution read with the session", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await listClaims(request("/api/institution/attestations"));
  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/institution\/affiliations$/);
  assert.equal(calls[0].authorization, "Bearer session-token");
});

test("the queue route refuses an absent session before any upstream call", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ data: [] }, 200, calls);

  const response = await listClaims(new Request("http://localhost:3000/api/institution/attestations"));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("the decide route forwards the body to the nested path", async () => {
  const calls: UpstreamCall[] = [];
  stubFetch({ id: "claim-1", status: "verified" }, 200, calls);

  const response = await decideClaim(
    request("/api/institution/attestations/claim-1/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "verify", reason: "checked" }),
    }),
    { params: Promise.resolve({ id: "claim-1" }) },
  );

  assert.equal(response.status, 200);
  assert.match(calls[0].url, /\/v1\/institution\/affiliations\/claim-1\/decide$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].authorization, "Bearer session-token");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    decision: "verify",
    reason: "checked",
  });
});

test("a 409 refusal keeps its status and code", async () => {
  stubFetch({ code: "CLAIM_ALREADY_DECIDED" }, 409);

  const response = await decideClaim(
    request("/api/institution/attestations/claim-1/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "reject", reason: "late" }),
    }),
    { params: Promise.resolve({ id: "claim-1" }) },
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "CLAIM_ALREADY_DECIDED");
});

test("a non-JSON upstream becomes a 502 problem", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const response = await listClaims(request("/api/institution/attestations"));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INTERNAL_ERROR");
});
