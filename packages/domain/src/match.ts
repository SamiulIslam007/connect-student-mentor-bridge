import { MATCH_ALUMNI_BATCH_DISTANCE, MATCH_FACTOR_WEIGHTS } from "@connect/config";

import type { AvailabilityWindow } from "./availability.js";

/**
 * The matching rule (spec: matching/mentor-suggestions,
 * `docs/matching-algorithm-spec.md` §6). Pure: no database, HTTP or Node import,
 * so the ranking can be argued about without a server.
 *
 * Three of the four documented factors ship (D-91). GoalAlignment is always
 * missing because neither side stores a structured goal type, and §6.3's
 * missing-factor rule renormalizes the active weights.
 */

export interface MatchAffiliation {
  institutionId: string;
  department: string | null;
  batchYear: number | null;
}

export interface MatchStudent {
  id: string;
  primaryFieldId: string;
  interestFieldIds: string[];
  /** The single `VERIFIED` affiliation, or null when none is verified. */
  affiliation: MatchAffiliation | null;
  availability: AvailabilityWindow[];
}

export interface MatchCandidate {
  /** The mentor profile id; the tie-break hash is keyed on it. */
  id: string;
  /** The primary field first, then the additional fields. */
  fieldIds: string[];
  affiliation: MatchAffiliation | null;
  availability: AvailabilityWindow[];
  weeklyCapacity: number;
  slotsInUse: number;
  /** Requests received inside the rolling capacity window. */
  requestsInWindow: number;
}

/** A factor is either a measured value in [0, 1] or missing for want of data. */
export type MatchFactorValue = number | null;

export interface MatchFactors {
  field: MatchFactorValue;
  alumni: MatchFactorValue;
  availability: MatchFactorValue;
  /** Always null: no structured goal exists on either side (D-91). */
  goal: null;
}

export interface MatchResult {
  /** Weighted average of the active factors, rounded to six decimals. */
  score: number;
  factors: MatchFactors;
  /** True whenever a documented factor was excluded for missing data. */
  limitedInformation: boolean;
}

const FACTOR_KEYS = ["field", "alumni", "availability", "goal"] as const;

function roundSix(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * The student's primary field weighs two and each interest field one, so a
 * mentor sharing the primary field only scores 2 / (2 + interests).
 */
export function fieldOverlap(student: MatchStudent, candidate: MatchCandidate): number {
  const weights = new Map<string, number>([[student.primaryFieldId, 2]]);
  for (const id of student.interestFieldIds) {
    if (id !== student.primaryFieldId) {
      weights.set(id, 1);
    }
  }
  let total = 0;
  let shared = 0;
  for (const [id, weight] of weights) {
    total += weight;
    if (candidate.fieldIds.includes(id)) {
      shared += weight;
    }
  }
  return total === 0 ? 0 : shared / total;
}

function sameDepartment(a: string | null, b: string | null): boolean {
  if (!a || !b) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * 1.0 for the same institution, the same department and a batch year inside the
 * configured distance; 0.5 for the same institution and department with a batch
 * year outside it or unrecorded; zero otherwise; missing when the student holds
 * no verified affiliation.
 */
export function alumniConnection(
  student: MatchAffiliation | null,
  candidate: MatchAffiliation | null,
): MatchFactorValue {
  if (!student) {
    return null;
  }
  if (!candidate || candidate.institutionId !== student.institutionId) {
    return 0;
  }
  if (!sameDepartment(student.department, candidate.department)) {
    return 0;
  }
  if (student.batchYear === null || candidate.batchYear === null) {
    return 0.5;
  }
  return Math.abs(student.batchYear - candidate.batchYear) <= MATCH_ALUMNI_BATCH_DISTANCE
    ? 1
    : 0.5;
}

interface Interval {
  startMinute: number;
  endMinute: number;
}

function mergedIntervals(windows: AvailabilityWindow[], weekday: number): Interval[] {
  const sorted = windows
    .filter((window) => window.weekday === weekday)
    .map((window) => ({ startMinute: window.startMinute, endMinute: window.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** The measure of the intersection of two merged interval lists, in minutes. */
function intersectionMinutes(a: Interval[], b: Interval[]): number {
  let i = 0;
  let j = 0;
  let total = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].startMinute, b[j].startMinute);
    const end = Math.min(a[i].endMinute, b[j].endMinute);
    if (end > start) {
      total += end - start;
    }
    if (a[i].endMinute < b[j].endMinute) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return total;
}

function totalMinutes(windows: AvailabilityWindow[]): number {
  return windows.reduce((sum, window) => sum + (window.endMinute - window.startMinute), 0);
}

/**
 * Overlapping wall-clock minutes over the smaller side's total minutes, capped
 * at 1.0. Missing when either side declared nothing, or when the two sides are
 * declared in different time zones.
 *
 * shortcut: differing zones are treated as missing instead of converted, which
 * is correct only for a single-country pilot (D-94; Phase 2 debt row).
 */
export function availabilityOverlap(
  student: AvailabilityWindow[],
  candidate: AvailabilityWindow[],
): MatchFactorValue {
  if (student.length === 0 || candidate.length === 0) {
    return null;
  }
  const zones = new Set([...student, ...candidate].map((window) => window.timezone));
  if (zones.size > 1) {
    return null;
  }

  let overlap = 0;
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    overlap += intersectionMinutes(
      mergedIntervals(student, weekday),
      mergedIntervals(candidate, weekday),
    );
  }
  const smaller = Math.min(totalMinutes(student), totalMinutes(candidate));
  if (smaller <= 0) {
    return 0;
  }
  return Math.min(1, overlap / smaller);
}

/** One candidate's score, its factors, and whether any factor was excluded. */
export function scoreCandidate(student: MatchStudent, candidate: MatchCandidate): MatchResult {
  const factors: MatchFactors = {
    field: fieldOverlap(student, candidate),
    alumni: alumniConnection(student.affiliation, candidate.affiliation),
    availability: availabilityOverlap(student.availability, candidate.availability),
    goal: null,
  };

  let weighted = 0;
  let activeWeight = 0;
  let missing = 0;
  for (const key of FACTOR_KEYS) {
    const value = factors[key];
    if (value === null) {
      missing += 1;
      continue;
    }
    weighted += value * MATCH_FACTOR_WEIGHTS[key];
    activeWeight += MATCH_FACTOR_WEIGHTS[key];
  }

  return {
    score: activeWeight === 0 ? 0 : roundSix(weighted / activeWeight),
    factors,
    limitedInformation: missing > 0,
  };
}

/**
 * FNV-1a over `studentId:mentorProfileId`, unsigned 32-bit. Dependency-free and
 * identical across processes, so a tie resolves the same way everywhere (R5).
 */
export function stablePairHash(studentId: string, mentorProfileId: string): number {
  const input = `${studentId}:${mentorProfileId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface ScoredCandidate {
  candidate: MatchCandidate;
  result: MatchResult;
}

/**
 * Score descending, then remaining capacity descending, then fewer requests in
 * the window, then the pair hash. No key is a popularity measure.
 */
export function orderSuggestions(studentId: string, scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => {
    if (b.result.score !== a.result.score) {
      return b.result.score - a.result.score;
    }
    const remainingA = a.candidate.weeklyCapacity - a.candidate.slotsInUse;
    const remainingB = b.candidate.weeklyCapacity - b.candidate.slotsInUse;
    if (remainingB !== remainingA) {
      return remainingB - remainingA;
    }
    if (a.candidate.requestsInWindow !== b.candidate.requestsInWindow) {
      return a.candidate.requestsInWindow - b.candidate.requestsInWindow;
    }
    return stablePairHash(studentId, a.candidate.id) - stablePairHash(studentId, b.candidate.id);
  });
}

/** The suggestion set size (§6). */
export const SUGGESTION_LIMIT = 5;

/** One to three reasons, in weighted-contribution order (§8). */
export const MAX_SUGGESTION_REASONS = 3;
