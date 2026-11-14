import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { NextResponse } from "next/server";

import { GET as mintRoute } from "../app/api/csrf/route.js";
import { GET as getMe } from "../app/api/me/route.js";
import { POST as pauseProfile } from "../app/api/me/mentor-profile/pause/route.js";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfCookieOptions,
  csrfMode,
  ensureCsrfToken,
  mintCsrfToken,
  originAllowed,
  requireCsrf,
  sameToken,
} from "../lib/csrf.js";
import { csrfFetch } from "../lib/csrf-client.js";
import { SESSION_COOKIE_NAME } from "../lib/session-cookie.js";

const ORIGIN = "http://localhost:3000";
const previousOrigin = process.env.BETTER_AUTH_URL;
const previousMode = process.env.WEB_CSRF_MODE;
const previousFetch = globalThis.fetch;
const previousDocument = (globalThis as { document?: unknown }).document;

process.env.BETTER_AUTH_URL = ORIGIN;

afterEach(() => {
  globalThis.fetch = previousFetch;
  if (previousOrigin === undefined) {
    delete process.env.BETTER_AUTH_URL;
  } else {
    process.env.BETTER_AUTH_URL = previousOrigin;
  }
  if (previousMode === undefined) {
    delete process.env.WEB_CSRF_MODE;
  } else {
    process.env.WEB_CSRF_MODE = previousMode;
  }
  (globalThis as { document?: unknown }).document = previousDocument;
});

function sessionRequest(headers: Record<string, string> = {}, path = "/api/me/mentor-profile/pause"): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE_NAME}=session-1`, ...headers },
  });
}

function stubFetch(status = 200, payload: unknown = { ok: true }): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls };
}

test("a token is 32 random bytes in base64url and two mints differ", () => {
  const first = mintCsrfToken();
  const second = mintCsrfToken();
  assert.equal(first.length, 43);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
});

test("the token cookie is readable by the client helper and sameSite lax", () => {
  const development = csrfCookieOptions(false);
  assert.equal(development.httpOnly, false, "double submit needs a readable value");
  assert.equal(development.sameSite, "lax");
  assert.equal(development.secure, false);
  assert.equal(development.path, "/");
  assert.equal(csrfCookieOptions(true).secure, true);
});

test("sameToken refuses any difference including length and absence", () => {
  assert.equal(sameToken("abcdef", "abcdef"), true);
  assert.equal(sameToken("abcdef", "abcdeg"), false, "off by one character");
  assert.equal(sameToken("abcdef", "abcde"), false);
  assert.equal(sameToken("abcdef", ""), false);
  assert.equal(sameToken("", ""), false);
  assert.equal(sameToken(null, "abcdef"), false);
  assert.equal(sameToken("abcdef", null), false);
});

test("originAllowed compares the configured origin and tolerates an absent header", () => {
  assert.equal(
    originAllowed(new Request(`${ORIGIN}/x`, { headers: { origin: ORIGIN } })),
    true,
  );
  assert.equal(
    originAllowed(new Request(`${ORIGIN}/x`, { headers: { origin: "https://evil.example" } })),
    false,
  );
  assert.equal(
    originAllowed(new Request(`${ORIGIN}/x`, { headers: { referer: `${ORIGIN}/sign-in` } })),
    true,
    "a request with no Origin falls back to Referer",
  );
  assert.equal(originAllowed(new Request(`${ORIGIN}/x`)), true, "a stripped header is not a failure on its own");
  assert.equal(originAllowed(new Request(`${ORIGIN}/x`, { headers: { origin: "not a url" } })), false);
});

test("a write with no token is 403 CSRF_INVALID and the API is never called", async () => {
  const stub = stubFetch();
  const response = await pauseProfile(sessionRequest({ origin: ORIGIN }));
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code?: string; status?: number; detail?: string };
  assert.equal(body.code, "CSRF_INVALID");
  assert.equal(body.status, 403);
  assert.match(body.detail ?? "", new RegExp(CSRF_HEADER_NAME), "the refusal names the header");
  assert.deepEqual(stub.calls, [], "nothing reaches the API");
});

test("a write with a mismatched token is refused", async () => {
  const stub = stubFetch();
  const response = await pauseProfile(
    sessionRequest({
      origin: ORIGIN,
      cookie: `${SESSION_COOKIE_NAME}=session-1; ${CSRF_COOKIE_NAME}=right-value`,
      [CSRF_HEADER_NAME]: "wrong-value",
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { code?: string }).code, "CSRF_INVALID");
  assert.deepEqual(stub.calls, []);
});

test("a cross-site origin is refused even with a matched token", async () => {
  const stub = stubFetch();
  const response = await pauseProfile(
    sessionRequest({
      origin: "https://evil.example",
      cookie: `${SESSION_COOKIE_NAME}=session-1; ${CSRF_COOKIE_NAME}=same-value`,
      [CSRF_HEADER_NAME]: "same-value",
    }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(stub.calls, []);
});

test("a matched token from the app's own origin reaches the API unchanged", async () => {
  const stub = stubFetch();
  const response = await pauseProfile(
    sessionRequest({
      origin: ORIGIN,
      cookie: `${SESSION_COOKIE_NAME}=session-1; ${CSRF_COOKIE_NAME}=same-value`,
      [CSRF_HEADER_NAME]: "same-value",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(stub.calls.length, 1);
  assert.match(stub.calls[0] ?? "", /\/v1\/me\/mentor-profile\/pause$/);
});

test("a request with no session cookie is not refused: there is nothing to protect", async () => {
  const response = requireCsrf(
    new Request(`${ORIGIN}/api/requests`, { method: "POST", headers: { origin: ORIGIN } }),
  );
  assert.equal(response, null);
});

test("WEB_CSRF_MODE=off restores the old behaviour", () => {
  process.env.WEB_CSRF_MODE = "off";
  assert.equal(csrfMode(), "off");
  assert.equal(requireCsrf(sessionRequest({ origin: "https://evil.example" })), null);
  delete process.env.WEB_CSRF_MODE;
  assert.equal(csrfMode(), "enforce");
});

test("GET /api/me mints the token when it is absent and leaves an existing value alone", async () => {
  stubFetch();
  const minted = await getMe(
    new Request(`${ORIGIN}/api/me`, { headers: { cookie: `${SESSION_COOKIE_NAME}=session-1` } }),
  );
  const setCookie = minted.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`^${CSRF_COOKIE_NAME}=`));
  assert.equal(/HttpOnly/i.test(setCookie), false, "the client helper must be able to read it");
  assert.match(setCookie, /Path=\//);

  const kept = await getMe(
    new Request(`${ORIGIN}/api/me`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=session-1; ${CSRF_COOKIE_NAME}=existing` },
    }),
  );
  assert.equal(kept.headers.get("set-cookie"), null, "an existing token is not replaced");
});

test("an anonymous read of /api/me is not given a token", async () => {
  stubFetch();
  const response = await getMe(new Request(`${ORIGIN}/api/me`));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("GET /api/csrf mints for a signed-in caller and refuses an anonymous one", async () => {
  const signedIn = await mintRoute(
    new Request(`${ORIGIN}/api/csrf`, { headers: { cookie: `${SESSION_COOKIE_NAME}=session-1` } }),
  );
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get("set-cookie") ?? "", new RegExp(`^${CSRF_COOKIE_NAME}=`));
  assert.equal(signedIn.headers.get("cache-control"), "no-store");

  const anonymous = await mintRoute(new Request(`${ORIGIN}/api/csrf`));
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("set-cookie"), null);
});

test("ensureCsrfToken does nothing when no session cookie is present", () => {
  const response = ensureCsrfToken(new Request(`${ORIGIN}/api/me`), NextResponse.json({}));
  assert.equal(response.headers.get("set-cookie"), null);
});

test("csrfFetch sends the header, re-mints once on a refusal, and retries once", async () => {
  (globalThis as { document?: unknown }).document = { cookie: `${CSRF_COOKIE_NAME}=stale` };
  const calls: string[] = [];
  const tokens: Array<string | null> = [];
  let attempt = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    tokens.push(new Headers(init?.headers).get(CSRF_HEADER_NAME));
    attempt += 1;
    if (String(input).endsWith("/api/csrf")) {
      (globalThis as { document?: { cookie: string } }).document = {
        cookie: `${CSRF_COOKIE_NAME}=fresh`,
      };
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (attempt === 1) {
      return new Response(JSON.stringify({ code: "CSRF_INVALID" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const response = await csrfFetch("/api/requests", { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3, "one refused attempt, one mint, one retry");
  assert.equal(tokens[0], "stale", "the stale cookie value is sent first");
  assert.equal(tokens[2], "fresh", "the retry carries the re-minted token");
});

test("csrfFetch does not loop when the retry is refused again", async () => {
  (globalThis as { document?: unknown }).document = { cookie: `${CSRF_COOKIE_NAME}=stale` };
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    if (String(input).endsWith("/api/csrf")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({ code: "CSRF_INVALID" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const response = await csrfFetch("/api/requests", { method: "POST" });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 3, "no third attempt");
});

test("csrfFetch leaves a non-CSRF failure alone", async () => {
  (globalThis as { document?: unknown }).document = { cookie: `${CSRF_COOKIE_NAME}=stale` };
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ code: "VALIDATION_FAILED" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const response = await csrfFetch("/api/requests", { method: "POST" });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1, "no mint and no retry for another refusal code");
});

test("a read through a catch-all route is not CSRF-guarded", async () => {
  const { GET: getMentorship } = await import("../app/api/mentorships/[[...path]]/route.js");
  const { GET: getOutcome } = await import("../app/api/outcomes/[[...path]]/route.js");

  for (const [label, handler, segment] of [
    ["mentorships", getMentorship, "03226373-940e-4741-b2eb-7ccb68ee444c"],
    ["outcomes", getOutcome, "5fec9fb6-4bd1-4b02-b0f6-b0ad2e075d14"],
  ] as const) {
    stubFetch(200, { id: segment });
    const response = await handler(
      new Request(`${ORIGIN}/api/${label}/${segment}`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=session-1` },
      }),
      { params: Promise.resolve({ path: [segment] }) },
    );
    const body = JSON.stringify(await response.json());
    assert.equal(
      body.includes("CSRF_INVALID"),
      false,
      `${label} GET must not be refused by the write guard (the shared forward helper serves reads too)`,
    );
  }
});
