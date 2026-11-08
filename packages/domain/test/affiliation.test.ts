import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emailDomainOf,
  hasLevelOne,
  resolveAffiliationClaim,
} from "../src/affiliation.js";

test("the email domain is trimmed and case-folded", () => {
  assert.equal(emailDomainOf("  A.Student@EXAMPLE.EDU.BD "), "example.edu.bd");
  assert.equal(emailDomainOf("a.student@example.edu.bd"), "example.edu.bd");
  assert.equal(emailDomainOf("no-at-sign"), null);
  assert.equal(emailDomainOf("@example.edu.bd"), null);
  assert.equal(emailDomainOf("a@"), null);
});

test("a registered domain on a verified address grants Level 1", () => {
  assert.deepEqual(
    resolveAffiliationClaim({
      email: "a.student@example.edu.bd",
      emailVerified: true,
      registeredDomains: ["example.edu.bd"],
    }),
    { granted: true, level: "LEVEL_1", method: "INSTITUTIONAL_EMAIL", status: "VERIFIED" },
  );
});

test("case and surrounding whitespace on either side still match", () => {
  assert.deepEqual(
    resolveAffiliationClaim({
      email: "A.Student@EXAMPLE.EDU.BD",
      emailVerified: true,
      registeredDomains: ["  Example.Edu.Bd "],
    }),
    { granted: true, level: "LEVEL_1", method: "INSTITUTIONAL_EMAIL", status: "VERIFIED" },
  );
});

test("an unverified address never grants a level, whatever its domain", () => {
  assert.deepEqual(
    resolveAffiliationClaim({
      email: "a.student@example.edu.bd",
      emailVerified: false,
      registeredDomains: ["example.edu.bd"],
    }),
    { granted: false, code: "AFFILIATION_EMAIL_UNVERIFIED" },
  );
});

test("an unregistered domain is stored pending at Level 0", () => {
  assert.deepEqual(
    resolveAffiliationClaim({
      email: "a.student@other.example",
      emailVerified: true,
      registeredDomains: ["example.edu.bd"],
    }),
    { granted: true, level: "LEVEL_0", method: "INSTITUTIONAL_EMAIL", status: "PENDING" },
  );
});

test("only Level 1 and above count as the request gate", () => {
  assert.equal(hasLevelOne("LEVEL_0"), false);
  assert.equal(hasLevelOne(null), false);
  assert.equal(hasLevelOne(undefined), false);
  assert.equal(hasLevelOne("LEVEL_1"), true);
  assert.equal(hasLevelOne("LEVEL_2"), true);
});
