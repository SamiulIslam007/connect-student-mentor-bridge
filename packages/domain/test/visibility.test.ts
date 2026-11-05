import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canViewProfile,
  ROLES,
  type ProfileKind,
  type ProfileViewer,
  type Role,
} from "../src/index.js";

const NOBODY: ProfileViewer = {
  authenticated: false,
  isOwner: false,
  roles: [],
  hasRequestFromSubject: false,
  hasInstitutionConsent: false,
  hasCaseReference: false,
};

function viewer(patch: Partial<ProfileViewer>): ProfileViewer {
  return { ...NOBODY, authenticated: true, ...patch };
}

/** The nine documented rows of the FR-PROF-04 matrix (design D7). */
const DOCUMENTED: { name: string; viewer: ProfileViewer; expected: Record<ProfileKind, string> }[] = [
  {
    name: "owner",
    viewer: viewer({ isOwner: true, roles: ["STUDENT"] }),
    expected: { STUDENT: "VISIBLE", MENTOR: "VISIBLE" },
  },
  {
    name: "no session",
    viewer: NOBODY,
    expected: { STUDENT: "HIDDEN", MENTOR: "HIDDEN" },
  },
  {
    name: "student, not the owner",
    viewer: viewer({ roles: ["STUDENT"] }),
    expected: { STUDENT: "HIDDEN", MENTOR: "VISIBLE" },
  },
  {
    name: "mentor with a request from that student",
    viewer: viewer({ roles: ["MENTOR"], hasRequestFromSubject: true }),
    expected: { STUDENT: "VISIBLE", MENTOR: "VISIBLE" },
  },
  {
    name: "mentor without a request",
    viewer: viewer({ roles: ["MENTOR"] }),
    expected: { STUDENT: "HIDDEN", MENTOR: "VISIBLE" },
  },
  {
    name: "institution admin with consent",
    viewer: viewer({ roles: ["INSTITUTION_ADMIN"], hasInstitutionConsent: true }),
    expected: { STUDENT: "VISIBLE", MENTOR: "VISIBLE" },
  },
  {
    name: "institution admin without consent",
    viewer: viewer({ roles: ["INSTITUTION_ADMIN"] }),
    expected: { STUDENT: "HIDDEN", MENTOR: "VISIBLE" },
  },
  {
    name: "platform admin with a case reference",
    viewer: viewer({ roles: ["PLATFORM_ADMIN"], hasCaseReference: true }),
    expected: { STUDENT: "VISIBLE", MENTOR: "VISIBLE" },
  },
  {
    name: "platform admin without a case reference",
    viewer: viewer({ roles: ["PLATFORM_ADMIN"] }),
    expected: { STUDENT: "HIDDEN", MENTOR: "VISIBLE" },
  },
];

test("every documented matrix row holds for both profile kinds", () => {
  assert.equal(DOCUMENTED.length, 9);
  for (const row of DOCUMENTED) {
    assert.equal(canViewProfile(row.viewer, "STUDENT"), row.expected.STUDENT, row.name);
    assert.equal(canViewProfile(row.viewer, "MENTOR"), row.expected.MENTOR, row.name);
  }
});

test("the policy is total over the whole cross-product and never leaks a student profile", () => {
  const kinds: ProfileKind[] = ["STUDENT", "MENTOR"];
  const roleSets: Role[][] = [[], ...ROLES.map((role) => [role])];
  let combinations = 0;

  for (const authenticated of [false, true]) {
    for (const isOwner of [false, true]) {
      for (const roles of roleSets) {
        for (const hasRequestFromSubject of [false, true]) {
          for (const hasInstitutionConsent of [false, true]) {
            for (const hasCaseReference of [false, true]) {
              const subject: ProfileViewer = {
                authenticated,
                isOwner,
                roles,
                hasRequestFromSubject,
                hasInstitutionConsent,
                hasCaseReference,
              };
              for (const kind of kinds) {
                const answer = canViewProfile(subject, kind);
                combinations += 1;
                assert.ok(answer === "VISIBLE" || answer === "HIDDEN", "every cell has an answer");
                if (!authenticated) {
                  assert.equal(answer, "HIDDEN", "no session sees nothing");
                }
                if (authenticated && kind === "MENTOR") {
                  assert.equal(answer, "VISIBLE", "a signed-in account sees a mentor profile");
                }
                if (authenticated && isOwner) {
                  assert.equal(answer, "VISIBLE", "the owner always sees their own profile");
                }
              }
            }
          }
        }
      }
    }
  }

  assert.equal(combinations, 2 * 2 * 6 * 2 * 2 * 2 * 2);
});
