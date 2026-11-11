import { MATCH_FACTOR_WEIGHTS } from "@connect/config";
import { MAX_SUGGESTION_REASONS, type MatchResult, type MatchStudent } from "@connect/domain";

import { mentorDirectoryPayload, type SuggestionPoolCandidate } from "../profiles/profiles.service.js";

/**
 * The suggestion read (spec: matching/mentor-suggestions). The payload builder
 * and the reason text live here, away from the score, so the strings a student
 * reads are asserted without a database.
 */

export interface MatchingService {
  /** At most five suggestions for one student, already in their wire shape. */
  suggest(input: { userId: string }): Promise<Record<string, unknown>[]>;
}

/** The student's own field ids: the primary one first, then the interests. */
function studentFieldIds(student: MatchStudent): Set<string> {
  return new Set([student.primaryFieldId, ...student.interestFieldIds]);
}

/** The candidate's fields that the student also holds, primary name first. */
export function sharedFieldNames(
  student: MatchStudent,
  candidate: SuggestionPoolCandidate,
): string[] {
  const mine = studentFieldIds(student);
  const names: string[] = [];
  if (mine.has(candidate.primaryField.id)) {
    names.push(candidate.primaryField.name);
  }
  for (const field of candidate.fields) {
    if (mine.has(field.id) && !names.includes(field.name)) {
      names.push(field.name);
    }
  }
  return names;
}

/**
 * One to three plain-language reasons, in weighted-contribution order, built
 * only from active factors above zero and from declared profile facts. A reason
 * never claims that the mentor will help, has helped, or is the best match.
 */
export function buildReasons(
  student: MatchStudent,
  candidate: SuggestionPoolCandidate,
  result: MatchResult,
): string[] {
  const contributions: { weight: number; text: string }[] = [];

  const field = result.factors.field;
  if (field !== null && field > 0) {
    const [first] = sharedFieldNames(student, candidate);
    if (first) {
      contributions.push({
        weight: field * MATCH_FACTOR_WEIGHTS.field,
        text: `Shares your field: ${first}.`,
      });
    }
  }

  const alumni = result.factors.alumni;
  if (alumni !== null && alumni > 0 && candidate.affiliation) {
    contributions.push({
      weight: alumni * MATCH_FACTOR_WEIGHTS.alumni,
      text:
        alumni === 1
          ? `Studied the same department at your institution, in or near your batch.`
          : `Studied ${candidate.affiliation.department} at your institution.`,
    });
  }

  const availability = result.factors.availability;
  if (availability !== null && availability > 0) {
    contributions.push({
      weight: availability * MATCH_FACTOR_WEIGHTS.availability,
      text: "Has weekly availability that overlaps yours.",
    });
  }

  return contributions
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SUGGESTION_REASONS)
    .map((entry) => entry.text);
}

/**
 * The directory card spread plus exactly two keys (design R3), so the two
 * projections cannot diverge and no score can leak.
 */
export function suggestionPayload(
  candidate: SuggestionPoolCandidate,
  student: MatchStudent,
  result: MatchResult,
): Record<string, unknown> {
  return {
    ...mentorDirectoryPayload({
      id: candidate.id,
      displayName: candidate.displayName,
      headline: candidate.headline,
      accessState: candidate.accessState,
      accessMode: candidate.accessMode,
      primaryField: candidate.primaryField,
      fields: candidate.fields,
      languages: candidate.languages,
    }),
    reasons: buildReasons(student, candidate, result),
    limited_information: result.limitedInformation,
  };
}
