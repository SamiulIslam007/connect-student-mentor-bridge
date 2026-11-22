import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { proxyJson } from "../lib/bff.js";
import { csrfFetch } from "../lib/csrf-client.js";

/**
 * SEC-AUDIT-015: the API implements `Idempotency-Key` on request create, outcome
 * report and message post. The BFF dropped it, so a retry or double submit could
 * create a second row. The browser helper now mints one key per action.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { document?: unknown }).document;
});

function stubUpstream(): { headers: Record<string, string>[]; urls: string[] } {
  const headers: Record<string, string>[] = [];
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    headers.push((init?.headers ?? {}) as Record<string, string>);
    return new Response(JSON.stringify({ status: "accepted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { headers, urls };
}

function sessionRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ mentor_id: "mentor-1", goal: "review my CV" }),
  });
}

test("proxyJson forwards the caller's idempotency key", async () => {
  const upstream = stubUpstream();

  await proxyJson("/v1/requests", sessionRequest({ "idempotency-key": "action-key-1" }), {
    sessionToken: "opaque-session-token",
  });

  assert.equal(upstream.headers[0]["idempotency-key"], "action-key-1");
});

test("proxyJson sends no key when the caller sent none", async () => {
  const upstream = stubUpstream();

  await proxyJson("/v1/requests", sessionRequest({}), { sessionToken: "opaque-session-token" });

  assert.equal(upstream.headers[0]["idempotency-key"], undefined);
});

test("proxyJson refuses to forward an oversized or malformed key", async () => {
  const upstream = stubUpstream();

  await proxyJson("/v1/requests", sessionRequest({ "idempotency-key": "k".repeat(300) }), {
    sessionToken: "opaque-session-token",
  });
  await proxyJson("/v1/requests", sessionRequest({ "idempotency-key": "has spaces in it" }), {
    sessionToken: "opaque-session-token",
  });

  assert.equal(upstream.headers[0]["idempotency-key"], undefined);
  assert.equal(upstream.headers[1]["idempotency-key"], undefined);
});

function stubClientFetch(): { keys: (string | null)[] } {
  const keys: (string | null)[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get("idempotency-key"));
    return new Response(JSON.stringify({ status: "accepted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { keys };
}

function browserDocument(cookie = ""): void {
  (globalThis as { document?: unknown }).document = { cookie };
}

test("csrfFetch sends one key per action and a double submit reuses it", async () => {
  browserDocument();
  const client = stubClientFetch();
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "hello" }),
  };

  await csrfFetch("/api/mentorships/m1/messages", init);
  await csrfFetch("/api/mentorships/m1/messages", init);

  assert.equal(client.keys.length, 2);
  assert.ok(client.keys[0], "a write carries a key");
  assert.equal(client.keys[0], client.keys[1], "the second click is the same action");
});

test("a different body is a different action", async () => {
  browserDocument();
  const client = stubClientFetch();

  await csrfFetch("/api/mentorships/m1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "first" }),
  });
  await csrfFetch("/api/mentorships/m1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "second" }),
  });

  assert.notEqual(client.keys[0], client.keys[1]);
});

test("a read carries no key, and a caller-supplied key is kept", async () => {
  browserDocument();
  const client = stubClientFetch();

  await csrfFetch("/api/mentorships/m1", { method: "GET" });
  await csrfFetch("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "caller-key" },
    body: "{}",
  });

  assert.equal(client.keys[0], null);
  assert.equal(client.keys[1], "caller-key");
});

test("the CSRF retry reuses the same key", async () => {
  browserDocument();
  const keys: (string | null)[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/csrf") {
      browserDocument("connect_csrf=fresh-token");
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    keys.push(new Headers(init?.headers).get("idempotency-key"));
    if (keys.length === 1) {
      return new Response(JSON.stringify({ code: "CSRF_INVALID" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: "accepted" }), { status: 200 });
  }) as typeof fetch;

  const response = await csrfFetch("/api/outcomes/o1/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement: "x" }),
  });

  assert.equal(response.status, 200);
  assert.equal(keys.length, 2);
  assert.ok(keys[0]);
  assert.equal(keys[1], keys[0], "a retry of the same action must not look new");
});

test("a plain-HTTP LAN origin without Web Crypto still gets a key", async () => {
  browserDocument();
  const client = stubClientFetch();
  const cryptoApi = globalThis.crypto as { randomUUID?: unknown };
  const original = cryptoApi.randomUUID;
  cryptoApi.randomUUID = undefined;
  try {
    await csrfFetch("/api/mentorships/lan/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "from a LAN demo" }),
    });
  } finally {
    cryptoApi.randomUUID = original;
  }

  assert.ok(client.keys[0], "the write still carries a dedupe key");
  assert.match(client.keys[0] as string, /^k-[a-z0-9]+-[a-z0-9]+$/);
});
