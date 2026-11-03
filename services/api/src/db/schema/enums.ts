import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Canonical enum values live in `docs/data-model.md` section 4.1. The API uses
 * the mechanical lowercase form of the database value.
 */
export const accountStatus = pgEnum("account_status", [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_PENDING",
  "ANONYMIZED",
]);

export const institutionKind = pgEnum("institution_kind", [
  "UNIVERSITY",
  "BOOTCAMP",
  "TRAINING_INSTITUTE",
  "OTHER",
]);

export const institutionStatus = pgEnum("institution_status", [
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
]);

export const consentPurpose = pgEnum("consent_purpose", [
  "TERMS",
  "PRIVACY_NOTICE",
  "VOLUNTEER_AGREEMENT",
  "COMMUNITY_GUIDELINES",
  "INSTITUTION_DATA_SHARING",
]);

export const consentAction = pgEnum("consent_action", ["GRANTED", "WITHDRAWN"]);

export const signupBlockReason = pgEnum("signup_block_reason", ["UNDER_18"]);

export const fieldStatus = pgEnum("field_status", ["ACTIVE", "RETIRED"]);

export const mentorStatus = pgEnum("mentor_status", [
  "DRAFT",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
]);
