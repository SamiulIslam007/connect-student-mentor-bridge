import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { accountTracker } from "../src/http/account-throttler.js";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function request(input: {
  body?: unknown;
  authorization?: string;
  cookie?: string;
  ip?: string;
}): Record<string, unknown> {
  const headers: Record<string, string> = {};
  if (input.authorization) headers.authorization = input.authorization;
  if (input.cookie) headers.cookie = input.cookie;
  return { body: input.body, headers, ip: input.ip };
}

test("one account seen from two addresses resolves to one key", () => {
  const first = accountTracker(request({ body: { email: "student@example.com" }, ip: "203.0.113.5" }));
  const second = accountTracker(request({ body: { email: " STUDENT@example.com " }, ip: "198.51.100.9" }));

  assert.equal(first, second, "the key follows the account, not the address");
  assert.equal(first, `body:${sha256("student@example.com")}`);
});

test("two accounts resolve to different keys", () => {
  const one = accountTracker(request({ body: { email: "one@example.com" }, ip: "203.0.113.5" }));
  const two = accountTracker(request({ body: { email: "two@example.com" }, ip: "203.0.113.5" }));

  assert.notEqual(one, two);
});

test("a session credential is the key when the body carries no account", () => {
  const token = "session-token-value";
  const key = accountTracker(request({ authorization: `Bearer ${token}`, ip: "203.0.113.5" }));
  assert.equal(key, `session:${sha256(token)}`);

  const cookie = accountTracker(request({ cookie: "connect_session=abc123", ip: "203.0.113.5" }));
  assert.match(cookie, /^session:/);
  assert.match(cookie.slice("session:".length), /^[0-9a-f]{64}$/);
});

test("a request with no body and no session falls back to the address", () => {
  const key = accountTracker(request({ ip: "203.0.113.5" }));
  assert.equal(key, "ip:203.0.113.5");

  const bare = accountTracker({});
  assert.equal(bare, "ip:unknown", "a request without an address still resolves to a key");
});

test("no key carries an at-sign or a readable address", () => {
  const keys = [
    accountTracker(request({ body: { email: "student@example.com" }, ip: "203.0.113.5" })),
    accountTracker(request({ authorization: "Bearer abc", ip: "203.0.113.5" })),
    accountTracker(request({ body: { email: 42 }, ip: "203.0.113.5" })),
  ];
  for (const key of keys) {
    assert.doesNotMatch(key, /@/);
  }
  assert.doesNotMatch(keys[0], /student/);
});

test("a non-string or blank email does not become a key", () => {
  assert.equal(accountTracker(request({ body: { email: "   " }, ip: "203.0.113.5" })), "ip:203.0.113.5");
  assert.equal(accountTracker(request({ body: { email: null }, ip: "203.0.113.5" })), "ip:203.0.113.5");
  assert.equal(accountTracker(request({ body: "not-an-object", ip: "203.0.113.5" })), "ip:203.0.113.5");
});
