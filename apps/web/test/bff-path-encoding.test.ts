import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST } from "../app/api/institutions/[id]/admins/route.js";

/**
 * SEC-AUDIT-020: every other dynamic BFF route encodes its id; this one
 * interpolated it raw, so a traversal-shaped segment could build a different API
 * path with the same method and body.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubUpstream(): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ status: "granted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function grantRequest(): Request {
  return new Request("http://localhost:3000/api/institutions/x/admins", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "connect_session=opaque-session-token; connect_csrf=a-token",
      "x-csrf-token": "a-token",
    },
    body: JSON.stringify({ email: "admin@example.edu.bd" }),
  });
}

test("a traversal-shaped institution id stays one encoded segment", async () => {
  const calls = stubUpstream();
  const id = "../../../v1/admin/accounts/x/suspend";

  const response = await POST(grantRequest(), { params: Promise.resolve({ id }) });

  assert.equal(response.status, 200);
  const upstream = new URL(calls[0]);
  assert.equal(upstream.pathname, `/v1/admin/institutions/${encodeURIComponent(id)}/admins`);
  assert.equal(upstream.pathname.includes("/../"), false, "the id must not become a path segment");
  assert.equal(upstream.pathname.startsWith("/v1/admin/institutions/"), true);
});

test("a percent-encoded id is encoded once more, never decoded into a separator", async () => {
  const calls = stubUpstream();
  const id = "..%2F..%2Fv1%2Fadmin%2Faccounts%2Fx%2Fsuspend";

  await POST(grantRequest(), { params: Promise.resolve({ id }) });

  assert.match(calls[0], /%252F/, "the percent sign itself is encoded");
  assert.equal(calls[0].includes("%2F.."), false);
});
