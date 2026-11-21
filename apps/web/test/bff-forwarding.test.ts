import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";

import { CLIENT_KEY_HEADER, CLIENT_SIGNATURE_HEADER } from "../lib/client-key.js";
import { upstreamHeaders } from "../lib/bff.js";

const originalSecret = process.env.BFF_TRUST_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.BFF_TRUST_SECRET;
  } else {
    process.env.BFF_TRUST_SECRET = originalSecret;
  }
});

test("the upstream request carries the signed client key and the session bearer", () => {
  process.env.BFF_TRUST_SECRET = "test-bff-secret";
  const request = new Request("http://localhost:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "10.0.0.2",
      authorization: "Bearer browser-cookie-token",
    },
  });

  const headers = upstreamHeaders(request, "opaque-session-token");

  assert.equal(headers[CLIENT_KEY_HEADER], "203.0.113.7");
  assert.equal(
    headers[CLIENT_SIGNATURE_HEADER],
    createHmac("sha256", "test-bff-secret").update("203.0.113.7").digest("hex"),
  );
  assert.equal(headers.authorization, "Bearer opaque-session-token");
  assert.equal(headers["x-forwarded-for"], undefined);
  assert.equal(headers["x-real-ip"], undefined);
});

test("a foreign forwarding header is replaced, not appended", () => {
  process.env.BFF_TRUST_SECRET = "test-bff-secret";
  const request = new Request("http://localhost:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.4",
      [CLIENT_KEY_HEADER]: "attacker-chosen",
      [CLIENT_SIGNATURE_HEADER]: "attacker-signature",
    },
  });

  const headers = upstreamHeaders(request);

  assert.equal(headers[CLIENT_KEY_HEADER], "198.51.100.4");
  assert.notEqual(headers[CLIENT_KEY_HEADER], "attacker-chosen");
  assert.notEqual(headers[CLIENT_SIGNATURE_HEADER], "attacker-signature");
  assert.equal(headers.authorization, undefined);
});
