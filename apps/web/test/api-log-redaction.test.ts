import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { callApi } from "../lib/api.js";

/**
 * SEC-AUDIT-023 (D-260): a failed upstream call logs the route and the error
 * class, never the query string and never the upstream detail.
 */

const originalFetch = globalThis.fetch;
const originalError = console.error;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
});

function captureLog(): string[] {
  const lines: string[] = [];
  console.error = ((...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  }) as typeof console.error;
  return lines;
}

test("a token-bearing path logs the route only", async () => {
  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.9:3001?token=upstream-secret");
  }) as typeof fetch;
  const lines = captureLog();

  const response = await callApi("/v1/auth/verify?token=tok_live_123&email=student@example.com");

  assert.equal(response.status, 502);
  assert.equal(lines.length, 1);
  const serialized = lines[0];
  for (const secret of ["tok_live_123", "student@example.com", "upstream-secret", "ECONNREFUSED"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not reach the log`);
  }
  const logged = JSON.parse(serialized) as { event: string; route: string; error_class: string };
  assert.equal(logged.event, "web.api_unreachable");
  assert.equal(logged.route, "/v1/auth/verify");
  assert.equal(logged.error_class, "Error");
});

test("a normal path logs the same shape", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("timeout");
  }) as typeof fetch;
  const lines = captureLog();

  await callApi("/v1/outcomes");

  const logged = JSON.parse(lines[0]) as { route: string; error_class: string };
  assert.equal(logged.route, "/v1/outcomes");
  assert.equal(logged.error_class, "TypeError");
});
