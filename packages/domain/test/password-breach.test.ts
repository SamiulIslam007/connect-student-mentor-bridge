import assert from "node:assert/strict";
import { test } from "node:test";

import { breachCountFrom, rangePrefix } from "../src/password-breach";

// The documented example: "password" hashes to this digest and appears in the
// corpus, so the range body for 5BAA6 carries this suffix.
const PASSWORD = "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

test("the prefix is the first five hex characters, uppercase", () => {
  assert.equal(rangePrefix(PASSWORD), "5BAA6");
  assert.equal(rangePrefix(PASSWORD.toUpperCase()), "5BAA6");
  assert.equal(rangePrefix(`  ${PASSWORD}  `), "5BAA6");
});

test("a short, long, non-hex or empty digest has no prefix", () => {
  for (const bad of ["", "5baa6", "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8a", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]) {
    assert.equal(rangePrefix(bad), null, bad);
  }
});

test("a body containing the suffix returns its count", () => {
  const body = `0002EEFFB2CCA91812B5CC9956854E22BEB:4\r\n${SUFFIX}:3861493\r\n00115AE168591C338025516216655E42A09:17`;
  assert.equal(breachCountFrom(body, PASSWORD), 3861493);
});

test("a body without the suffix is clean, not unknown", () => {
  const body = "0002EEFFB2CCA91812B5CC9956854E22BEB:4\r\n00115AE168591C338025516216655E42A09:17";
  assert.equal(breachCountFrom(body, PASSWORD), 0);
});

test("padded rows carry zero and read as clean", () => {
  const body = `${SUFFIX}:0\r\n0002EEFFB2CCA91812B5CC9956854E22BEB:4`;
  assert.equal(breachCountFrom(body, PASSWORD), 0);
});

test("an empty or shapeless body is unknown", () => {
  assert.equal(breachCountFrom("", PASSWORD), null);
  assert.equal(breachCountFrom("not a list at all", PASSWORD), null);
  assert.equal(breachCountFrom("<html>503</html>", PASSWORD), null);
});

test("a malformed line is skipped, a valid one still matches", () => {
  const body = `garbage\r\n${SUFFIX}:12\r\nshort:99`;
  assert.equal(breachCountFrom(body, PASSWORD), 12);
});

test("the digest is the only thing that can make a body unreadable", () => {
  assert.equal(breachCountFrom(`${SUFFIX}:12`, "nope"), null);
});
