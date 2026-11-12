import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createInstitutionBody,
  institutionRows,
  institutionSummary,
} from "../lib/institutions.js";
import { strings } from "../lib/strings.js";

const draft = {
  name: "  Dhaka University  ",
  kind: "UNIVERSITY",
  countryCode: "bd",
  mouSignedOn: "2026-10-01",
  domains: "DU.ac.bd, cse.du.ac.bd ,",
};

test("the create body is trimmed, upper-cased and lower-cased", () => {
  assert.deepEqual(createInstitutionBody(draft), {
    ok: true,
    body: {
      name: "Dhaka University",
      kind: "UNIVERSITY",
      country_code: "BD",
      mou_signed_on: "2026-10-01",
      domains: ["du.ac.bd", "cse.du.ac.bd"],
    },
  });
});

test("empty optional fields are left out of the body", () => {
  assert.deepEqual(
    createInstitutionBody({ ...draft, mouSignedOn: "   ", domains: " , " }),
    { ok: true, body: { name: "Dhaka University", kind: "UNIVERSITY", country_code: "BD" } },
  );
});

test("the draft is refused before any request is made", () => {
  assert.deepEqual(createInstitutionBody({ ...draft, name: "  " }), {
    ok: false,
    error: strings.adminInstitutions.nameRequired,
  });
  assert.deepEqual(createInstitutionBody({ ...draft, countryCode: "BDX" }), {
    ok: false,
    error: strings.adminInstitutions.countryInvalid,
  });
  assert.deepEqual(createInstitutionBody({ ...draft, domains: "someone@du.ac.bd" }), {
    ok: false,
    error: strings.adminInstitutions.domainInvalid,
  });
  assert.deepEqual(createInstitutionBody({ ...draft, domains: "not-a-domain" }), {
    ok: false,
    error: strings.adminInstitutions.domainInvalid,
  });
  assert.deepEqual(createInstitutionBody({ ...draft, name: "x".repeat(161) }), {
    ok: false,
    error: strings.adminInstitutions.nameTooLong,
  });
});

test("a malformed payload reads as an empty list", () => {
  assert.deepEqual(institutionRows(undefined), []);
  assert.deepEqual(institutionRows({}), []);
  assert.deepEqual(institutionRows({ data: "nope" }), []);
  assert.deepEqual(institutionRows({ data: [{ name: "no id" }] }), []);
});

test("a row keeps its domains and a missing list reads as none", () => {
  const [row] = institutionRows({
    data: [
      {
        id: "i-1",
        name: "Alpha University",
        kind: "UNIVERSITY",
        country_code: "BD",
        status: "ONBOARDING",
        mou_signed_on: null,
        domains: ["alpha.edu.bd"],
      },
      { id: "i-2", name: "Beta", kind: "OTHER", country_code: "BD", status: "ACTIVE" },
    ],
  });
  assert.equal(row?.domains[0], "alpha.edu.bd");
  assert.equal(institutionSummary(row), "ONBOARDING · BD · alpha.edu.bd");
  assert.match(
    institutionSummary({ ...row, domains: [] }),
    new RegExp(strings.adminInstitutions.noDomains),
  );
});

const page = readFileSync(
  fileURLToPath(new URL("../app/admin/institutions/page.tsx", import.meta.url)),
  "utf8",
);

test("the page reads and writes through the BFF route", () => {
  assert.match(page, /fetch\("\/api\/institutions"\)/);
  assert.match(page, /fetch\("\/api\/institutions", \{\r?\n\s+method: "POST"/);
  assert.match(page, /strings\.adminInstitutions\./);
  assert.doesNotMatch(page, /cookies\(\)/, "a client page never reads the session cookie");
  assert.match(page, /response\.status === 409/, "a duplicate domain is its own message");
});

test("the page shows the empty, refusal and signed-out states", () => {
  for (const key of ["empty", "loadError", "signedOut", "mfaRequired", "createError"]) {
    assert.ok(page.includes(`strings.adminInstitutions.${key}`), `${key} is rendered`);
  }
});
