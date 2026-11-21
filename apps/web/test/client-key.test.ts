import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";

import {
  CLIENT_KEY_HEADER,
  CLIENT_SIGNATURE_HEADER,
  clientKeyFromRequest,
  signedClientHeaders,
} from "../lib/client-key.js";

const originalSecret = process.env.BFF_TRUST_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.BFF_TRUST_SECRET;
  } else {
    process.env.BFF_TRUST_SECRET = originalSecret;
  }
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/auth/sign-in", { method: "POST", headers });
}

test("the key is the first transport peer, never a client-supplied key header", () => {
  const key = clientKeyFromRequest(
    request({
      "x-forwarded-for": "203.0.113.7, 10.0.0.2",
      [CLIENT_KEY_HEADER]: "spoofed-by-the-client",
    }),
  );

  assert.equal(key, "203.0.113.7");
});

test("a missing peer header is one anonymous bucket, never an empty key", () => {
  assert.equal(clientKeyFromRequest(request()), "unknown");
});

test("the forwarded key is signed with the BFF secret", () => {
  process.env.BFF_TRUST_SECRET = "test-bff-secret";

  const headers = signedClientHeaders(request({ "x-forwarded-for": "198.51.100.9" }));

  assert.equal(headers[CLIENT_KEY_HEADER], "198.51.100.9");
  assert.equal(
    headers[CLIENT_SIGNATURE_HEADER],
    createHmac("sha256", "test-bff-secret").update("198.51.100.9").digest("hex"),
  );
});

test("without a secret no key is forwarded, so the API falls back to the peer", () => {
  delete process.env.BFF_TRUST_SECRET;

  assert.deepEqual(signedClientHeaders(request({ "x-forwarded-for": "198.51.100.9" })), {});
});
