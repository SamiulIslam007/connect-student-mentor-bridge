import type {
  AvailabilityWindow,
  MatchAffiliation,
  MentorAccessMode,
  MentorAccessModeChoice,
  MentorOnboardingStatus,
  MentorOperatingStatus,
  MentorProfileDraft,
  StudentProfileDraft,
} from "@connect/domain";

/** What `GET /v1/fields` and every profile response expose. Ids are opaque. */
export interface FieldSummary {
  id: string;
  name: string;
}

export interface StudentProfileRecord {
  goals: string;
  primaryField: FieldSummary;
  interestFields: FieldSummary[];
  languages: string[];
}

export interface MentorProfileRecord {
  headline: string;
  bio: string;
  expertiseSummary: string;
  scopeStatement: string;
  primaryField: FieldSummary;
  fields: FieldSummary[];
  languages: string[];
  weeklyCapacity: number;
  accessMode: MentorAccessMode;
  /** Operating status; #7 filters requestable mentors on it. */
  status: MentorOperatingStatus;
  onboardingStatus: MentorOnboardingStatus;
}

export interface OwnProfiles {
  studentProfile: StudentProfileRecord | null;
  mentorProfile: MentorProfileRecord | null;
}

/** The request form's read: a requestable mentor, never another account's data. */
export interface MentorContext {
  id: string;
  displayName: string;
  headline: string;
  accessMode: MentorAccessMode;
  status: MentorOperatingStatus;
  primaryField: FieldSummary;
}

/** The directory's derived state (design D4); never stored. */
export type MentorAccessState = "available" | "application_only" | "full";

/** The public directory projection (design D6): no email, no capacity, no biography. */
export interface MentorDirectoryCard {
  id: string;
  displayName: string;
  headline: string;
  accessState: MentorAccessState;
  accessMode: MentorAccessMode;
  primaryField: FieldSummary;
  fields: FieldSummary[];
  languages: string[];
}

export interface ListMentorsInput {
  /** A field uuid; matches the primary field or an additional one. */
  field?: string;
  /** One stored language, matched case-insensitively and exactly. */
  language?: string;
  accessState?: MentorAccessState;
  /** The last mentor profile id of the previous page. */
  cursor?: string;
  /** 1 to 50, defaulting to 20. */
  limit: number;
}

export interface MentorDirectoryPage {
  cards: MentorDirectoryCard[];
  nextCursor: string | null;
}

export interface SaveStudentProfileInput {
  userId: string;
  draft: StudentProfileDraft;
}

export interface SaveMentorProfileInput {
  userId: string;
  draft: MentorProfileDraft;
}

export interface SetMentorAccessModeInput {
  userId: string;
  accessMode: MentorAccessModeChoice | "PAUSED";
}

export interface ListFieldsInput {
  /** Page size: 1 to 200, defaulting to 100. */
  limit: number;
  /** The last slug of the previous page. */
  cursor?: string;
}

export interface FieldPage {
  fields: FieldSummary[];
  nextCursor: string | null;
}

/** Wire shapes: snake_case, and no profile id or timestamp is exposed (design D4). */
export function studentProfilePayload(profile: StudentProfileRecord): Record<string, unknown> {
  return {
    goals: profile.goals,
    primary_field: profile.primaryField,
    interest_fields: profile.interestFields,
    languages: profile.languages,
  };
}

export function mentorProfilePayload(profile: MentorProfileRecord): Record<string, unknown> {
  return {
    headline: profile.headline,
    bio: profile.bio,
    expertise_summary: profile.expertiseSummary,
    scope_statement: profile.scopeStatement,
    primary_field: profile.primaryField,
    fields: profile.fields,
    languages: profile.languages,
    weekly_capacity: profile.weeklyCapacity,
    access_mode: profile.accessMode,
    status: profile.status,
    onboarding_status: profile.onboardingStatus,
  };
}

/** The request form's mentor read: no biography, no contact details. */
export function mentorContextPayload(context: MentorContext): Record<string, unknown> {
  return {
    id: context.id,
    display_name: context.displayName,
    headline: context.headline,
    access_mode: context.accessMode,
    status: context.status,
    primary_field: context.primaryField,
  };
}

/**
 * The directory card's wire shape. The key set is the public allowlist and is
 * asserted by a test, so a new field cannot be exposed silently (design D6).
 */
export function mentorDirectoryPayload(card: MentorDirectoryCard): Record<string, unknown> {
  return {
    id: card.id,
    display_name: card.displayName,
    headline: card.headline,
    access_state: card.accessState,
    access_mode: card.accessMode,
    primary_field: card.primaryField,
    fields: card.fields,
    languages: card.languages,
  };
}

/**
 * The pool the suggestion read scores (design R2). It reuses the directory's
 * conditions, capacity aggregate and field join, and adds only what the score
 * needs, so a second capacity rule can never appear.
 */
export interface SuggestionPoolStudent {
  id: string;
  userId: string;
  primaryFieldId: string;
  interestFieldIds: string[];
  /** The one `VERIFIED` affiliation, or null when none is verified. */
  affiliation: MatchAffiliation | null;
  availability: AvailabilityWindow[];
}

export interface SuggestionPoolCandidate extends MentorDirectoryCard {
  /** The primary field id followed by the additional ones. */
  fieldIds: string[];
  affiliation: MatchAffiliation | null;
  availability: AvailabilityWindow[];
  weeklyCapacity: number;
  slotsInUse: number;
  /** Requests received inside the rolling capacity window. */
  requestsInWindow: number;
}

export interface SuggestionPool {
  /** Null when the account has no student profile; the controller refuses. */
  student: SuggestionPoolStudent | null;
  candidates: SuggestionPoolCandidate[];
}

/**
 * The bounded candidate scan. shortcut: one ordered scan of 200 rows, so a
 * prefix crowded with ineligible mentors could yield fewer than five
 * suggestions; upgrade to a SQL prefilter when the pilot outgrows it.
 */
export const SUGGESTION_POOL_LIMIT = 200;

/**
 * The profile seam. Every method takes the acting user id, which the controller
 * derives from the session only, so no caller can address another user's profile.
 */
export interface ProfilesService {
  saveStudentProfile(input: SaveStudentProfileInput): Promise<StudentProfileRecord>;
  saveMentorProfile(input: SaveMentorProfileInput): Promise<MentorProfileRecord>;
  listFields(input: ListFieldsInput): Promise<FieldPage>;
  readProfiles(userId: string): Promise<OwnProfiles>;
  /** Pause or resume without resaving the profile; idempotent. */
  setMentorAccessMode(input: SetMentorAccessModeInput): Promise<MentorProfileRecord>;
  /** Null unless the profile exists and is ACTIVE (requestable). */
  readMentorContext(mentorProfileId: string): Promise<MentorContext | null>;
  /** The public directory read: ACTIVE, not PAUSED, keyset by profile id (design D4). */
  listMentors(input: ListMentorsInput): Promise<MentorDirectoryPage>;
  /** The suggestion read: one bounded scan with the directory's own rules (R2). */
  readSuggestionPool(input: { userId: string }): Promise<SuggestionPool>;
}
