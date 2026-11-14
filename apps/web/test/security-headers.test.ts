import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEB_SECURITY_HEADERS,
  WEB_SECURITY_HEADERS_SOURCE,
  cspHeaderKey,
  webSecurityHeaders,
} from "../lib/security-headers.js";

function header(headers: ReadonlyArray<{ key: string; value: string }>, key: string): string | undefined {
  return headers.find((entry) => entry.key === key)?.value;
}

test("every response carries the four static headers on every path", () => {
  assert.deepEqual(
    WEB_SECURITY_HEADERS.map((entry) => entry.key).sort(),
    ["Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"],
  );
  assert.equal(header(WEB_SECURITY_HEADERS, "X-Content-Type-Options"), "nosniff");
  assert.equal(header(WEB_SECURITY_HEADERS, "Referrer-Policy"), "no-referrer");
  assert.equal(header(WEB_SECURITY_HEADERS, "X-Frame-Options"), "DENY");
  assert.ok(header(WEB_SECURITY_HEADERS, "Permissions-Policy")?.includes("camera=()"));
  assert.equal(WEB_SECURITY_HEADERS_SOURCE, "/(.*)", "every path, one document tree");
});

test("the policy enforces by default and reports only when asked", () => {
  const enforcing = webSecurityHeaders("enforce");
  assert.ok(header(enforcing, "Content-Security-Policy"), "the enforcing header carries the policy");
  assert.equal(
    header(enforcing, "Content-Security-Policy-Report-Only"),
    undefined,
    "exactly one of the two headers, never both",
  );

  const reporting = webSecurityHeaders("report-only");
  assert.ok(header(reporting, "Content-Security-Policy-Report-Only"));
  assert.equal(header(reporting, "Content-Security-Policy"), undefined, "the rollback");

  assert.equal(cspHeaderKey("enforce"), "Content-Security-Policy");
  assert.equal(cspHeaderKey("report-only"), "Content-Security-Policy-Report-Only");
});

test("the mode is enforcing unless WEB_CSP_MODE says report-only", () => {
  const previous = process.env.WEB_CSP_MODE;
  try {
    delete process.env.WEB_CSP_MODE;
    assert.equal(header(webSecurityHeaders(), "Content-Security-Policy"), header(webSecurityHeaders("enforce"), "Content-Security-Policy"));

    process.env.WEB_CSP_MODE = "report-only";
    assert.ok(header(webSecurityHeaders(), "Content-Security-Policy-Report-Only"));

    process.env.WEB_CSP_MODE = "anything-else";
    assert.ok(header(webSecurityHeaders(), "Content-Security-Policy"), "an unknown value never weakens the default");
  } finally {
    if (previous === undefined) delete process.env.WEB_CSP_MODE;
    else process.env.WEB_CSP_MODE = previous;
  }
});

test("the policy names the eight directives the app actually uses", () => {
  const policy = header(webSecurityHeaders("enforce"), "Content-Security-Policy") ?? "";
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
