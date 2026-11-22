import assert from "node:assert/strict";
import { test } from "node:test";

import { failureLog } from "../src/http/problem-details.filter.js";
import { initObservability, scrubEvent } from "../src/platform/observability";

/**
 * SEC-INF/observability: what a report may carry (D-251). These cases stand in for
 * the hand check in a deployed environment, which cannot be performed here.
 */

test("a request with a token, a cookie and a message body reports none of them", () => {
  const event = scrubEvent({
    request: {
      headers: { authorization: "Bearer abc", cookie: "session=xyz", "content-type": "application/json" },
      cookies: { session: "xyz" },
      data: { message: "my private question", title: "keep me" },
      query_string: "token=abc",
    },
    user: { email: "student@example.com", ip_address: "1.2.3.4" },
  });

  const serialized = JSON.stringify(event);
  for (const secret of ["Bearer abc", "session=xyz", "my private question", "student@example.com", "1.2.3.4"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not survive scrubbing`);
  }
  assert.equal(event.request?.headers?.["content-type"], "application/json", "harmless headers stay");
  assert.deepEqual(event.request?.data, { message: "[scrubbed]", title: "keep me" });
});

test("breadcrumbs and extras are scrubbed at depth", () => {
  const event = scrubEvent({
    breadcrumbs: [{ data: { url: "/api/x", token: "abc" } }],
    extra: { nested: { note: "evidence text", count: 2 } },
  });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("abc"), false);
  assert.equal(serialized.includes("evidence text"), false);
  assert.equal(serialized.includes('"count":2'), true);
});

test("no DSN means nothing is initialised", async () => {
  const handle = await initObservability({ dsn: "" });
  assert.equal(handle.enabled, false);
  handle.captureException(new Error("ignored"));
});

test("the scrub list covers the header names that carry credentials", () => {
  const event = scrubEvent({
    request: {
      headers: {
        Authorization: "secret",
        "Set-Cookie": "a=b",
        "X-Csrf-Token": "c",
        "X-Api-Key": "d",
        "Proxy-Authorization": "e",
      },
    },
  });
  assert.deepEqual(event.request?.headers, {
    Authorization: "[scrubbed]",
    "Set-Cookie": "[scrubbed]",
    "X-Csrf-Token": "[scrubbed]",
    "X-Api-Key": "[scrubbed]",
    "Proxy-Authorization": "[scrubbed]",
  });
});

test("the 500 log carries no SQL, no params, no token and no query", () => {
  class DrizzleQueryError extends Error {}
  const drizzle = new DrizzleQueryError(
    "select * from outcomes where verification_token = $1 -- [\"tok_live_123\"]",
  );

  const line = failureLog(drizzle, { method: "GET", path: "/v1/outcomes/o1" }, "req-1");
  const serialized = JSON.stringify(line);

  assert.equal(line.event, "api.request_failed");
  assert.equal(line.request_id, "req-1");
  assert.equal(line.route, "/v1/outcomes/o1");
  assert.equal(line.error_class, "DrizzleQueryError");
  for (const secret of ["select *", "verification_token", "tok_live_123", "params", "'outcomes'"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not reach the log`);
  }
  // The same guard on a URL that carries a query string: only the path survives.
  const tokenUrl = failureLog(drizzle, { method: "GET", path: "/v1/auth/verify" }, "req-2");
  assert.equal(tokenUrl.route, "/v1/auth/verify");
  assert.equal(JSON.stringify(tokenUrl).includes("tok_live_123"), false);
});

test("the report scrubber drops exception values, frame vars, contexts, tags and the username", () => {
  const event = scrubEvent({
    exception: {
      values: [
        {
          type: "DrizzleQueryError",
          value: "select * from outcomes where id = $1 -- [\"secret-id\"]",
          stacktrace: {
            frames: [
              { vars: { token: "frame-secret", safe_count: 2 } },
            ],
          },
        },
      ],
    },
    contexts: { request: { session_token: "ctx-secret", route: "/v1/outcomes" } },
    tags: { user_email: "student@example.com", release: "abc" },
    user: { username: "rahim", email: "student@example.com", ip_address: "1.2.3.4" },
  });

  const serialized = JSON.stringify(event);
  for (const secret of ["select *", "secret-id", "frame-secret", "ctx-secret", "student@example.com", "rahim", "1.2.3.4"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not survive`);
  }
  assert.equal(event.exception?.values?.[0]?.type, "DrizzleQueryError", "the class name stays");
  assert.equal(event.exception?.values?.[0]?.value, "[scrubbed]");
  assert.equal((event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars as { safe_count: number }).safe_count, 2);
  assert.equal((event.contexts?.request as { route: string }).route, "/v1/outcomes");
  assert.equal(event.tags?.release, "abc");
});
