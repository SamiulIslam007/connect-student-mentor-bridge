import assert from "node:assert/strict";
import { test } from "node:test";

import { mentorActivation, type MentorActivationInput } from "../src/mentor-onboarding.js";

const NOW = new Date("2026-11-08T00:00:00.000Z");

function activation(overrides: Partial<MentorActivationInput> = {}) {
  return mentorActivation({
    current: "DRAFT",
    emailVerified: true,
    mfaEnrolled: false,
    level: null,
    hasVolunteerAgreement: true,
    hasCommunityGuidelines: true,
    orientationCompleted: true,
    activatedAt: null,
    now: NOW,
    ...overrides,
  });
}

/** The four combinations that keep a fully verified mentor out of ACTIVE (D-127). */
const MISSING_AGREEMENT = [
  ["volunteer agreement", { hasVolunteerAgreement: false }],
  ["community guidelines", { hasCommunityGuidelines: false }],
  ["orientation", { orientationCompleted: false }],
  ["all three", { hasVolunteerAgreement: false, hasCommunityGuidelines: false, orientationCompleted: false }],
] as const;

test("a fresh profile with neither condition stays DRAFT", () => {
  assert.deepEqual(activation(), {
    status: "DRAFT",
    onboardingStatus: "EMAIL_VERIFIED",
    activatedAt: null,
  });
  assert.deepEqual(activation({ emailVerified: false }), {
    status: "DRAFT",
    onboardingStatus: "APPLIED",
    activatedAt: null,
  });
});

test("Level 1 and an enrolled factor make the profile ACTIVE and set activated_at once", () => {
  const first = activation({ current: "PENDING", level: "LEVEL_1", mfaEnrolled: true });
  assert.deepEqual(first, {
    status: "ACTIVE",
    onboardingStatus: "AFFILIATION_VERIFIED",
    activatedAt: NOW,
  });

  const earlier = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    activation({ current: "ACTIVE", level: "LEVEL_1", mfaEnrolled: true, activatedAt: earlier })
      .activatedAt,
    earlier,
    "a later trigger never rewrites the first activated_at",
  );
});

test("Level 1 without a second factor is PENDING and never activated", () => {
  assert.deepEqual(activation({ level: "LEVEL_1" }), {
    status: "PENDING",
    onboardingStatus: "AFFILIATION_VERIFIED",
    activatedAt: null,
  });
});

test("a second factor without an affiliation is PENDING", () => {
  assert.deepEqual(activation({ mfaEnrolled: true }), {
    status: "PENDING",
    onboardingStatus: "EMAIL_VERIFIED",
    activatedAt: null,
  });
});

test("losing the second factor returns ACTIVE to PENDING and keeps activated_at", () => {
  const earlier = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(
    activation({ current: "ACTIVE", level: "LEVEL_1", mfaEnrolled: false, activatedAt: earlier }),
    { status: "PENDING", onboardingStatus: "AFFILIATION_VERIFIED", activatedAt: earlier },
  );
});

test("losing Level 1 returns ACTIVE to PENDING and keeps activated_at", () => {
  const earlier = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(
    activation({ current: "ACTIVE", level: "LEVEL_0", mfaEnrolled: true, activatedAt: earlier }),
    { status: "PENDING", onboardingStatus: "EMAIL_VERIFIED", activatedAt: earlier },
  );
});

test("a suspended or removed profile is never resurrected", () => {
  for (const current of ["SUSPENDED", "REMOVED"] as const) {
    assert.deepEqual(
      activation({ current, level: "LEVEL_1", mfaEnrolled: true }),
      { status: current, onboardingStatus: "AFFILIATION_VERIFIED", activatedAt: null },
    );
  }
});

test("Level 1 and a factor without the agreements stay PENDING; with them the profile is ACTIVE", () => {
  for (const [label, missing] of MISSING_AGREEMENT) {
    assert.deepEqual(
      activation({ current: "PENDING", level: "LEVEL_1", mfaEnrolled: true, ...missing }),
      { status: "PENDING", onboardingStatus: "AFFILIATION_VERIFIED", activatedAt: null },
      `missing the ${label} must not activate`,
    );
  }
  assert.deepEqual(activation({ current: "PENDING", level: "LEVEL_1", mfaEnrolled: true }), {
    status: "ACTIVE",
    onboardingStatus: "AFFILIATION_VERIFIED",
    activatedAt: NOW,
  });
});

test("an ACTIVE profile without the agreements returns to PENDING and keeps activated_at", () => {
  const earlier = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(
    activation({
      current: "ACTIVE",
      level: "LEVEL_1",
      mfaEnrolled: true,
      hasVolunteerAgreement: false,
      activatedAt: earlier,
    }),
    { status: "PENDING", onboardingStatus: "AFFILIATION_VERIFIED", activatedAt: earlier },
  );
});
