import type { MentorAccessModeChoice } from "./availability.js";
import { FIELD_NAME_MAX_LENGTH, isAcceptableFieldName, normalizeFieldName } from "./fields.js";

/**
 * Proposed defaults (D-38). Sprint 7 replaces both with versioned configuration.
 * The database checks only `weekly_capacity >= 1`, because the upper bound is
 * policy and must not need a migration to change.
 */
export const MENTOR_WEEKLY_CAPACITY_MAX = 5;
export const STUDENT_INTEREST_FIELD_MAX = 2;
/** A mentor's primary field plus up to four additional fields (FR-PROF-02). */
export const MENTOR_FIELD_TOTAL_MAX = 5;
/** Mentoring languages, counted after case-folding and de-duplication. */
export const PROFILE_LANGUAGE_MAX = 5;

/**
 * Field names arriving from a request body. Validation is pure and returns
 * problems rather than throwing, so the API can map a non-empty list to one
 * `422 VALIDATION_FAILED` before any write happens (design D6).
 */
export interface StudentProfileDraft {
  goals: string;
  primaryField: string;
  interestFields: string[];
  languages: string[];
}

export interface MentorProfileDraft {
  headline: string;
  bio: string;
  expertiseSummary: string;
  scopeStatement: string;
  primaryField: string;
  additionalFields: string[];
  languages: string[];
  /** Raw body value: a string such as `"3"` is not a capacity. */
  weeklyCapacity: unknown;
  /** Absent leaves the stored mode alone; PAUSED is never accepted here. */
  accessMode?: MentorAccessModeChoice;
}

/** True only for a whole number inside the capacity policy range. */
export function isValidWeeklyCapacity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MENTOR_WEEKLY_CAPACITY_MAX
  );
}

/**
 * Case-folded ISO 639-1 codes, first spelling wins, empty entries dropped.
 * "EN" and "bn" become ["en", "bn"].
 */
export function normalizeLanguages(languages: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of languages) {
    const code = raw.trim().toLowerCase();
    if (code.length === 0 || seen.has(code)) {
      continue;
    }
    seen.add(code);
    result.push(code);
  }
  return result;
}

/**
 * Collapses spellings that share a normalized slug, keeping the first submitted
 * display name. `AI` and `ai` are one field, so they are one reference.
 */
export function distinctFieldNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const slug = normalizeFieldName(name);
    if (slug.length === 0) {
      result.push(name);
      continue;
    }
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    result.push(name);
  }
  return result;
}

function requiredTextProblems(entries: ReadonlyArray<readonly [string, string]>): string[] {
  return entries
    .filter(([, value]) => value.trim().length === 0)
    .map(([label]) => `${label} is required`);
}

function fieldNameProblems(names: string[], label: string): string[] {
  return names
    .filter((name) => !isAcceptableFieldName(name))
    .map(
      () => `${label} must be a field name of 1 to ${FIELD_NAME_MAX_LENGTH} characters`,
    );
}

function repeatsPrimary(names: string[], primaryField: string): boolean {
  const primarySlug = normalizeFieldName(primaryField);
  return (
    primarySlug.length > 0 &&
    names.some((name) => normalizeFieldName(name) === primarySlug)
  );
}

export function validateStudentProfileInput(input: StudentProfileDraft): string[] {
  const problems = requiredTextProblems([["goals", input.goals]]);
  if (!isAcceptableFieldName(input.primaryField)) {
    problems.push(
      `primary_field must be a field name of 1 to ${FIELD_NAME_MAX_LENGTH} characters`,
    );
  }

  const interests = distinctFieldNames(input.interestFields);
  problems.push(...fieldNameProblems(interests, "each interest field"));
  if (interests.length > STUDENT_INTEREST_FIELD_MAX) {
    problems.push(
      `at most ${STUDENT_INTEREST_FIELD_MAX} distinct interest fields are allowed`,
    );
  }
  if (repeatsPrimary(interests, input.primaryField)) {
    problems.push("an interest field cannot repeat the primary field");
  }
  if (normalizeLanguages(input.languages).length > PROFILE_LANGUAGE_MAX) {
    problems.push(`at most ${PROFILE_LANGUAGE_MAX} languages are allowed`);
  }
  return problems;
}

export function validateMentorProfileInput(input: MentorProfileDraft): string[] {
  const problems = requiredTextProblems([
    ["headline", input.headline],
    ["bio", input.bio],
    ["expertise_summary", input.expertiseSummary],
    ["scope_statement", input.scopeStatement],
  ]);
  if (!isAcceptableFieldName(input.primaryField)) {
    problems.push(
      `primary_field must be a field name of 1 to ${FIELD_NAME_MAX_LENGTH} characters`,
    );
  }

  const additional = distinctFieldNames(input.additionalFields);
  problems.push(...fieldNameProblems(additional, "each additional field"));
  if (repeatsPrimary(additional, input.primaryField)) {
    problems.push("an additional field cannot repeat the primary field");
  }
  if (additional.length + 1 > MENTOR_FIELD_TOTAL_MAX) {
    problems.push(
      `at most ${MENTOR_FIELD_TOTAL_MAX} fields are allowed (the primary field plus ${
        MENTOR_FIELD_TOTAL_MAX - 1
      })`,
    );
  }
  if (normalizeLanguages(input.languages).length > PROFILE_LANGUAGE_MAX) {
    problems.push(`at most ${PROFILE_LANGUAGE_MAX} languages are allowed`);
  }
  if (!isValidWeeklyCapacity(input.weeklyCapacity)) {
    problems.push(
      `weekly_capacity must be a whole number from 1 to ${MENTOR_WEEKLY_CAPACITY_MAX}`,
    );
  }
  return problems;
}
