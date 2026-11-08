import { hasLevelOne, type AffiliationLevel } from "./affiliation.js";

/**
 * Mentor activation (spec: profiles/mentor-onboarding). Verification progress
 * and operating status are separate values; only this function decides the
 * latter, so the three triggers cannot drift.
 */

export const MENTOR_OPERATING_STATUSES = [
  "DRAFT",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
] as const;
export type MentorOperatingStatus = (typeof MENTOR_OPERATING_STATUSES)[number];

export const MENTOR_ONBOARDING_STATUSES = [
  "APPLIED",
  "EMAIL_VERIFIED",
  "AFFILIATION_VERIFIED",
  "EMPLOYER_CHECKED",
] as const;
export type MentorOnboardingStatus = (typeof MENTOR_ONBOARDING_STATUSES)[number];

export interface MentorActivationInput {
  current: MentorOperatingStatus;
  emailVerified: boolean;
  mfaEnrolled: boolean;
  level: AffiliationLevel | null;
  activatedAt: Date | null;
  now: Date;
}

export interface MentorActivation {
  status: MentorOperatingStatus;
  onboardingStatus: MentorOnboardingStatus;
  /** Set the first time the profile becomes ACTIVE, and never cleared. */
  activatedAt: Date | null;
}

/**
 * A suspension or removal is an operator decision: a later trigger restates the
 * onboarding progress but never resurrects the profile.
 */
export function mentorActivation(input: MentorActivationInput): MentorActivation {
  const levelOne = hasLevelOne(input.level);
  const onboardingStatus: MentorOnboardingStatus = levelOne
    ? "AFFILIATION_VERIFIED"
    : input.emailVerified
      ? "EMAIL_VERIFIED"
      : "APPLIED";

  if (input.current === "SUSPENDED" || input.current === "REMOVED") {
    return { status: input.current, onboardingStatus, activatedAt: input.activatedAt };
  }

  if (levelOne && input.mfaEnrolled) {
    return {
      status: "ACTIVE",
      onboardingStatus,
      activatedAt: input.activatedAt ?? input.now,
    };
  }

  // A fresh profile that has met neither condition is still an application;
  // meeting one of them (but not both) moves it into the pending queue.
  const status: MentorOperatingStatus =
    input.current === "DRAFT" && !levelOne && !input.mfaEnrolled ? "DRAFT" : "PENDING";
  return { status, onboardingStatus, activatedAt: input.activatedAt };
}
