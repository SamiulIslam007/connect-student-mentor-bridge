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

export const availabilityContext = pgEnum("availability_context", ["STUDENT", "MENTOR"]);

/** `PAUSED` is set by pause/resume; the other two are chosen on the profile save. */
export const mentorAccessMode = pgEnum("mentor_access_mode", [
  "OPEN",
  "APPLICATION_ONLY",
  "PAUSED",
]);

/** Affiliation enums (docs/data-model.md §4.1). */
export const affiliationKind = pgEnum("affiliation_kind", [
  "ALUMNUS",
  "STUDENT",
  "FACULTY_STAFF",
  "EMPLOYEE",
]);

export const affiliationLevel = pgEnum("affiliation_level", ["LEVEL_0", "LEVEL_1", "LEVEL_2"]);

export const affiliationMethod = pgEnum("affiliation_method", [
  "INSTITUTIONAL_EMAIL",
  "ADMIN_ATTESTATION",
  "EMPLOYER_EMAIL",
  "PROFESSIONAL_LINK",
]);

export const affiliationStatus = pgEnum("affiliation_status", [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "REVOKED",
  "EXPIRED",
]);

/** Verification progress only; the operating status stays `mentor_status`. */
export const mentorOnboardingStatus = pgEnum("mentor_onboarding_status", [
  "APPLIED",
  "EMAIL_VERIFIED",
  "AFFILIATION_VERIFIED",
  "EMPLOYER_CHECKED",
]);

/** Canonical request enums (docs/data-model.md §4.1). */
export const requestStatus = pgEnum("request_status", [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "REDIRECTED",
  "EXPIRED",
  "WITHDRAWN",
]);

export const interactionType = pgEnum("interaction_type", [
  "ASYNC_THREAD",
  "ONE_TO_ONE_SESSION",
  "GROUP_OFFICE_HOURS",
]);

export const timeframeBucket = pgEnum("timeframe_bucket", [
  "WITHIN_1_MONTH",
  "ONE_TO_3_MONTHS",
  "THREE_TO_6_MONTHS",
  "OVER_6_MONTHS",
]);

/** Reserved: `target_outcome_type` is the only column that names it today. */
export const outcomeType = pgEnum("outcome_type", [
  "ADMISSION",
  "INTERNSHIP",
  "JOB_OFFER",
  "SKILL_MILESTONE",
  "INTERVIEW",
]);

/** Canonical mentorship enums (docs/data-model.md §4.1). */
export const mentorshipStatus = pgEnum("mentorship_status", ["ACTIVE", "COMPLETED", "ENDED_EARLY"]);

export const mentorshipCadence = pgEnum("mentorship_cadence", [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "AD_HOC",
]);

export const mentorshipSessionStatus = pgEnum("mentorship_session_status", [
  "SCHEDULED",
  "HELD",
  "CANCELLED",
]);

/** Outcome enums (docs/data-model.md §4.1, §4.4, §5.5). */
export const outcomeStatus = pgEnum("outcome_status", [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PLATFORM_REVIEW",
  "COUNTED",
  "REJECTED",
  "WITHDRAWN",
  "REVERSED",
]);

/** The three documented contribution levels; no fourth value exists. */
export const contributionLevel = pgEnum("contribution_level", [
  "DIRECTLY_ENABLED",
  "HELPED",
  "MINOR",
]);

/** The data-model list without the two reserved appeal values. */
export const outcomeEventType = pgEnum("outcome_event_type", [
  "REPORTED",
  "EVIDENCE_ADDED",
  "EVIDENCE_REMOVED",
  "REMINDER_D3_SENT",
  "REMINDER_D5_SENT",
  "ESCALATED_D7",
  "CONFIRMED",
  "CONTRIBUTION_AMENDED",
  "DISPUTED",
  "COI_DECLARED",
  "CASE_OPENED",
  "CASE_RESOLVED",
  "TIER_CHANGED",
  "COUNTED",
  "REJECTED",
  "WITHDRAWN",
  "REVERSED",
]);

export const verifierKind = pgEnum("verifier_kind", [
  "MENTOR_CONFIRMATION",
  "MENTOR_DISPUTE",
  "CONFLICT_OF_INTEREST",
  "THIRD_PARTY_CONFIRMATION",
  "AUDIT_RESULT",
  "PLATFORM_DECISION",
  "APPEAL_DECISION",
]);

export const verifierDecision = pgEnum("verifier_decision", [
  "CONFIRMED",
  "DISPUTED",
  "DECLARED",
  "VALID",
  "NOT_VALID",
  "PASSED",
  "FAILED",
]);

/** Canonical role values (docs/data-model.md §4.1). `EMPLOYER` is reserved. */
export const role = pgEnum("role", [
  "STUDENT",
  "MENTOR",
  "INSTITUTION_ADMIN",
  "PLATFORM_ADMIN",
  "EMPLOYER",
]);
