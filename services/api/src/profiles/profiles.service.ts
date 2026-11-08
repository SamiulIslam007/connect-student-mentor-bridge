import type {
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
}
