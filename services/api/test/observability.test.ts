import assert from "node:assert/strict";
import { test } from "node:test";

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
