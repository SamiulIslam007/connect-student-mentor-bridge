import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEB_SECURITY_HEADERS,
  WEB_SECURITY_HEADERS_SOURCE,
  cspHeader,
  cspHeaderKey,
  cspMode,
  hstsHeader,
  webCspPolicy,
  webSecurityHeaders,
} from "../lib/security-headers.js";

const NONCE = "0123456789abcdef0123456789abcdef";

function header(headers: ReadonlyArray<{ key: string; value: string }>, key: string): string | undefined {
  return headers.find((entry) => entry.key === key)?.value;
}

test("the static header set covers nosniff, framing, referrer, permissions, COOP and CORP", () => {
  assert.deepEqual(
    WEB_SECURITY_HEADERS.map((entry) => entry.key).sort(),
    [
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ],
  );
  assert.equal(header(WEB_SECURITY_HEADERS, "X-Content-Type-Options"), "nosniff");
  assert.equal(header(WEB_SECURITY_HEADERS, "Referrer-Policy"), "no-referrer");
  assert.equal(header(WEB_SECURITY_HEADERS, "X-Frame-Options"), "DENY");
  assert.equal(header(WEB_SECURITY_HEADERS, "Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(header(WEB_SECURITY_HEADERS, "Cross-Origin-Resource-Policy"), "same-origin");
  assert.ok(header(WEB_SECURITY_HEADERS, "Permissions-Policy")?.includes("camera=()"));
  assert.equal(WEB_SECURITY_HEADERS_SOURCE, "/(.*)", "every path, one document tree");
});

test("the script policy is nonce-based and unsafe-inline is gone from script-src", () => {
  const policy = webCspPolicy(NONCE);
  assert.match(policy, new RegExp(`script-src 'self' 'nonce-${NONCE}'`));
  assert.equal(/script-src[^;]*'unsafe-inline'/.test(policy), false, "no script unsafe-inline");
  // `'strict-dynamic'` would make the browser ignore `'self'`; Next only nonces
  // dynamically rendered pages, so a static page would lose its own chunks.
  assert.equal(policy.includes("'strict-dynamic'"), false);
  // The style residual is explicit and recorded as debt, not hidden.
  assert.equal(policy.includes("style-src 'self' 'unsafe-inline'"), true);
  for (const directive of [
    "default-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ]) {
    assert.ok(policy.includes(directive), `the policy carries ${directive}`);
  }
  assert.equal(policy.includes("'unsafe-eval'"), false, "no eval allowance");
});

test("a nonce that is too short or malformed is refused, never emitted", () => {
  for (const bad of ["", "short", "has spaces in it", "abc'defghijklmnop"]) {
    assert.throws(() => webCspPolicy(bad), /nonce/);
  }
});

test("the enforcing header carries the policy and the reporting key is the rollback", () => {
  const enforcing = cspHeader("enforce", NONCE);
  assert.equal(enforcing.key, "Content-Security-Policy");
  assert.ok(enforcing.value.includes(`'nonce-${NONCE}'`));

  const reporting = cspHeader("report-only", NONCE);
  assert.equal(reporting.key, "Content-Security-Policy-Report-Only");
  assert.equal(reporting.value, enforcing.value, "same policy, different key");

  assert.equal(cspHeaderKey("enforce"), "Content-Security-Policy");
  assert.equal(cspHeaderKey("report-only"), "Content-Security-Policy-Report-Only");
});

test("the mode is enforcing unless WEB_CSP_MODE says report-only", () => {
  const previous = process.env.WEB_CSP_MODE;
  try {
    delete process.env.WEB_CSP_MODE;
    assert.equal(cspMode(), "enforce");
    process.env.WEB_CSP_MODE = "report-only";
    assert.equal(cspMode(), "report-only");
    process.env.WEB_CSP_MODE = "anything-else";
    assert.equal(cspMode(), "enforce", "an unknown value never weakens the default");
  } finally {
    if (previous === undefined) {
      delete process.env.WEB_CSP_MODE;
    } else {
      process.env.WEB_CSP_MODE = previous;
    }
  }
});

test("HSTS is production only, and the static set never carries the CSP", () => {
  assert.equal(hstsHeader({ NODE_ENV: "development" }), null);
  assert.deepEqual(hstsHeader({ NODE_ENV: "production" }), {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });

  const development = webSecurityHeaders({ NODE_ENV: "development" });
  assert.equal(header(development, "Strict-Transport-Security"), undefined);
  assert.equal(header(development, "Content-Security-Policy"), undefined, "middleware owns it");

  const production = webSecurityHeaders({ NODE_ENV: "production" });
  assert.equal(
    header(production, "Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains",
  );
});
