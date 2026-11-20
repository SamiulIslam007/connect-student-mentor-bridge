import assert from "node:assert/strict";
import { test } from "node:test";

import {
  honeypotFilled,
  intentCookieFrom,
  intentRefusal,
  signupIntentCookieOptions,
} from "../lib/sign-up-intent.js";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const at = (secondsAgo: number): string => new Date(NOW - secondsAgo * 1000).toISOString();

test("a marker is missing when absent or unparseable", () => {
  assert.equal(intentRefusal({ cookieValue: undefined, now: NOW }), "missing");
  assert.equal(intentRefusal({ cookieValue: "", now: NOW }), "missing");
  assert.equal(intentRefusal({ cookieValue: "yesterday", now: NOW }), "missing");
});

test("the two-second floor is inclusive", () => {
  assert.equal(intentRefusal({ cookieValue: at(1), now: NOW }), "too-fast");
  assert.equal(intentRefusal({ cookieValue: at(2), now: NOW }), null);
  assert.equal(intentRefusal({ cookieValue: at(0.5), now: NOW }), "too-fast");
});

test("the one-hour ceiling is inclusive", () => {
  assert.equal(intentRefusal({ cookieValue: at(3600), now: NOW }), null);
  assert.equal(intentRefusal({ cookieValue: at(3601), now: NOW }), "stale");
});

test("a marker from the future is refused rather than trusted", () => {
  assert.equal(intentRefusal({ cookieValue: at(-5), now: NOW }), "too-fast");
});

test("only a non-empty trimmed honeypot counts as filled", () => {
  assert.equal(honeypotFilled({}), false);
  assert.equal(honeypotFilled({ contact_website: "" }), false);
  assert.equal(honeypotFilled({ contact_website: "   " }), false);
  assert.equal(honeypotFilled({ contact_website: "https://spam.example" }), true);
  assert.equal(honeypotFilled(null), false);
  assert.equal(honeypotFilled("not an object"), false);
});

test("the marker cookie is httpOnly, same-site, one hour and path-wide", () => {
  assert.deepEqual(signupIntentCookieOptions(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
    secure: false,
  });
  assert.equal(signupIntentCookieOptions(true).secure, true);
});

test("the marker is read from a Cookie header without touching the others", () => {
  const value = new Date(NOW).toISOString();
  assert.equal(intentCookieFrom(`connect_session=abc; connect_signup_intent=${value}`), value);
  assert.equal(intentCookieFrom(`connect_signup_intent=${encodeURIComponent(value)}`), value);
  assert.equal(intentCookieFrom("connect_session=abc"), undefined);
  assert.equal(intentCookieFrom("connect_signup_intent="), undefined);
  assert.equal(intentCookieFrom(null), undefined);
});
