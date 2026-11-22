import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumeIntentNonce,
  honeypotFilled,
  intentCookieFrom,
  intentRefusal,
  signIntent,
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

const SECRET = "an-intent-signing-secret-for-tests";

function signed(secondsAgo: number, nonce = "nonce-1"): string {
  return signIntent({ issuedAt: new Date(NOW - secondsAgo * 1000), secret: SECRET, nonce });
}

test("a signed marker is accepted, and its signature is required", () => {
  assert.equal(intentRefusal({ cookieValue: signed(10), now: NOW, secret: SECRET }), null);

  const value = signed(10);
  const [issuedAt, nonce] = value.split(".");
  // A tampered signature, a tampered instant and an unsigned legacy value.
  assert.equal(
    intentRefusal({ cookieValue: `${issuedAt}.${nonce}.not-the-signature`, now: NOW, secret: SECRET }),
    "forged",
  );
  assert.equal(
    intentRefusal({ cookieValue: signed(10).replace(issuedAt, at(10)), now: NOW, secret: SECRET }),
    "forged",
  );
  assert.equal(intentRefusal({ cookieValue: at(10), now: NOW, secret: SECRET }), "forged");
});

test("a marker signed with another secret is refused", () => {
  const other = signIntent({ issuedAt: new Date(NOW - 10_000), secret: "another-secret", nonce: "n-2" });
  assert.equal(intentRefusal({ cookieValue: other, now: NOW, secret: SECRET }), "forged");
});

test("a signed marker is single use", () => {
  const value = signed(10, "nonce-replay");
  // The read-only check reports the replay only after the nonce is consumed.
  assert.equal(intentRefusal({ cookieValue: value, now: NOW, secret: SECRET }), null);
  assert.equal(consumeIntentNonce(value), true);
  assert.equal(intentRefusal({ cookieValue: value, now: NOW, secret: SECRET }), "replayed");
  assert.equal(consumeIntentNonce(value), false, "the second submission is refused");
});

test("the clock still governs a signed marker", () => {
  assert.equal(intentRefusal({ cookieValue: signed(1, "n-fast"), now: NOW, secret: SECRET }), "too-fast");
  assert.equal(intentRefusal({ cookieValue: signed(3601, "n-old"), now: NOW, secret: SECRET }), "stale");
});
