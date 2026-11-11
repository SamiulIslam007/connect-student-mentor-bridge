import { Inject, Injectable } from "@nestjs/common";

import {
  IdentityError,
  SUGGESTION_LIMIT,
  orderSuggestions,
  scoreCandidate,
  type MatchCandidate,
  type MatchStudent,
} from "@connect/domain";

import { PROFILES_SERVICE } from "../profiles/profiles.tokens.js";
import type { ProfilesService, SuggestionPoolCandidate } from "../profiles/profiles.service.js";
import { suggestionPayload, type MatchingService } from "./matching.service.js";

function toMatchCandidate(row: SuggestionPoolCandidate): MatchCandidate {
  return {
    id: row.id,
    fieldIds: row.fieldIds,
    affiliation: row.affiliation,
    availability: row.availability,
    weeklyCapacity: row.weeklyCapacity,
    slotsInUse: row.slotsInUse,
    requestsInWindow: row.requestsInWindow,
  };
}

@Injectable()
export class DrizzleMatchingService implements MatchingService {
  constructor(@Inject(PROFILES_SERVICE) private readonly profiles: ProfilesService) {}

  async suggest({ userId }: { userId: string }): Promise<Record<string, unknown>[]> {
    const pool = await this.profiles.readSuggestionPool({ userId });
    if (!pool.student) {
      throw new IdentityError(
        "STUDENT_PROFILE_REQUIRED",
        "save a student profile before asking for suggestions",
      );
    }

    const student: MatchStudent = {
      id: pool.student.userId,
      primaryFieldId: pool.student.primaryFieldId,
      interestFieldIds: pool.student.interestFieldIds,
      affiliation: pool.student.affiliation,
      availability: pool.student.availability,
    };
    const mine = new Set([student.primaryFieldId, ...student.interestFieldIds]);

    // Eligibility first, before any score: an ineligible mentor is absent, not
    // ranked low (spec: eligibility filters).
    const eligible = pool.candidates.filter(
      (row) =>
        row.accessMode === "OPEN" &&
        row.slotsInUse < row.weeklyCapacity &&
        row.fieldIds.some((fieldId) => mine.has(fieldId)),
    );

    const byId = new Map(eligible.map((row) => [row.id, row]));
    const scored = eligible.map((row) => {
      const candidate = toMatchCandidate(row);
      return { candidate, result: scoreCandidate(student, candidate) };
    });

    return orderSuggestions(student.id, scored)
      .slice(0, SUGGESTION_LIMIT)
      .map((entry) => {
        const row = byId.get(entry.candidate.id);
        if (!row) {
          throw new Error("the ordered suggestion left the pool");
        }
        return suggestionPayload(row, student, entry.result);
      });
  }
}
