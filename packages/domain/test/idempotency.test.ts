import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, idempotencyKeyViolation } from "../src/idempotency.js";

test("the length bounds are 8 and 128", () => {
  assert.equal(idempotencyKeyViolation("1234567"), "an Idempotency-Key must be at least 8 characters");
  assert.equal(idempotencyKeyViolation("12345678"), null);
  assert.equal(idempotencyKeyViolation("x".repeat(128)), null);
  assert.equal(idempotencyKeyViolation("x".repeat(129)), "an Idempotency-Key must be at most 128 characters");
});

test("each refused character class is refused, and a mixed key is accepted", () => {
  for (const key of ["key with space", "key/with/slash", "key+plus", "key=equals", "key:colon", "key@at"]) {
    assert.notEqual(idempotencyKeyViolation(key), null, key);
  }
  assert.equal(idempotencyKeyViolation("Order_2026-11.20.a"), null);
});

test("the canonical string ignores key order at every depth", () => {
  const first = canonicalJson({ b: 1, a: { d: [3, { f: 4, e: 5 }], c: 2 } });
  const second = canonicalJson({ a: { c: 2, d: [3, { e: 5, f: 4 }] }, b: 1 });
  assert.equal(first, second);
  assert.equal(first, '{"a":{"c":2,"d":[3,{"e":5,"f":4}]},"b":1}');
});

test("arrays keep their order, and a different value changes the string", () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
  assert.equal(canonicalJson(undefined), "null");
});
