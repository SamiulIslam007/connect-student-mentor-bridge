import type { MentorProfileDraft, StudentProfileDraft } from "@connect/domain";

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
}

export interface OwnProfiles {
  studentProfile: StudentProfileRecord | null;
  mentorProfile: MentorProfileRecord | null;
}

export interface SaveStudentProfileInput {
  userId: string;
  draft: StudentProfileDraft;
}

export interface SaveMentorProfileInput {
  userId: string;
  draft: MentorProfileDraft;
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
  };
}

/**
 * The profile seam. Every method takes the acting user id, which the controller
 * derives from the session only, so no caller can address another user's profile.
 */
export interface ProfilesService {
  saveStudentProfile(input: SaveStudentProfileInput): Promise<StudentProfileRecord>;
  saveMentorProfile(input: SaveMentorProfileInput): Promise<MentorProfileRecord>;
  listFields(): Promise<FieldSummary[]>;
  readProfiles(userId: string): Promise<OwnProfiles>;
}
