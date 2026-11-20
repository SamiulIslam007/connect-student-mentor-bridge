import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeNameIdCursor, encodeNameIdCursor } from "../src/cursor.js";

const ID = "8f1a3f4c-2f2e-4b65-9f0f-1d3f2c4a5b6d";

test("the cursor round-trips a name and an id", () => {
  const cursor = encodeNameIdCursor({ name: "Dhaka University", id: ID });
  assert.deepEqual(decodeNameIdCursor(cursor), { name: "Dhaka University", id: ID });
});

test("a name containing the separator survives, because the encoding is not a split", () => {
  const cursor = encodeNameIdCursor({ name: "A|B University", id: ID });
  assert.deepEqual(decodeNameIdCursor(cursor), { name: "A|B University", id: ID });
});

test("a malformed cursor is refused instead of guessed", () => {
  for (const value of ["", "!!!", "not-base64-json", Buffer.from("{}").toString("base64url")]) {
    assert.equal(decodeNameIdCursor(value), null, value);
  }
});

test("an id-only or a name-only cursor is refused", () => {
  assert.equal(decodeNameIdCursor(Buffer.from(JSON.stringify([ID])).toString("base64url")), null);
  assert.equal(
    decodeNameIdCursor(Buffer.from(JSON.stringify(["Dhaka University"])).toString("base64url")),
    null,
  );
});

test("an id that is not a uuid is refused before it reaches the database", () => {
  assert.equal(
    decodeNameIdCursor(Buffer.from(JSON.stringify(["Dhaka University", "1"])).toString("base64url")),
    null,
  );
});
