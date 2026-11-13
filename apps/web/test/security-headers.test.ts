import assert from "node:assert/strict";
import { test } from "node:test";

import { WEB_SECURITY_HEADERS, WEB_SECURITY_HEADERS_SOURCE } from "../lib/security-headers.js";

function header(key: string): string | undefined {
  return WEB_SECURITY_HEADERS.find((entry) => entry.key === key)?.value;
}

test("the web app sends the five headers every response needs", () => {
  assert.deepEqual(
    WEB_SECURITY_HEADERS.map((entry) => entry.key).sort(),
    [
      "Content-Security-Policy-Report-Only",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ],
  );
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("Referrer-Policy"), "no-referrer");
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.ok(header("Permissions-Policy")?.includes("camera=()"));
  assert.equal(WEB_SECURITY_HEADERS_SOURCE, "/(.*)", "every path, one document tree");
});

test("the policy is report-only and enforces nothing yet", () => {
  assert.ok(header("Content-Security-Policy-Report-Only"), "the report-only header exists");
  assert.equal(
    header("Content-Security-Policy"),
    undefined,
    "no enforcing policy: that is the enforcement change's job",
  );
});

test("the policy names the eight directives the app actually uses", () => {
  const policy = header("Content-Security-Policy-Report-Only") ?? "";
  for (const directive of [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ]) {
    assert.ok(policy.includes(directive), `the policy carries ${directive}`);
  }
  assert.ok(!policy.includes("'unsafe-eval'"), "no eval allowance");
});
