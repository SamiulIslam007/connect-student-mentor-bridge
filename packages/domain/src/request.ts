import { hasLevelOne, type AffiliationLevel } from "./affiliation.js";

/**
 * Request lifecycle rules (spec: mentorship/request-lifecycle). Pure: no
 * database or HTTP import, so the API and the sweeper cannot disagree.
 */

export const REQUEST_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "REDIRECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** `expire` is the sweeper's action; the rest are caller actions. */
export const REQUEST_ACTIONS = ["accept", "decline", "withdraw", "expire"] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

/** Null means the action is not allowed from this status (design D7). */
export function requestTransition(status: RequestStatus, action: RequestAction): RequestStatus | null {
  if (status !== "PENDING") {
    return null;
  }
  switch (action) {
    case "accept":
      return "ACCEPTED";
    case "decline":
      return "DECLINED";
    case "withdraw":
      return "WITHDRAWN";
    case "expire":
      return "EXPIRED";
  }
}

/** At most three undecided requests per student (spec: duplicate/excessive). */
export const MAX_PENDING_REQUESTS_PER_STUDENT = 3;

/** The cap counts accepted requests decided inside this rolling window (D2). */
export const CAPACITY_WINDOW_DAYS = 7;

export const REQUEST_FIELD_LIMITS = {
  question: 300,
  contextSummary: 2_000,
  targetOutcome: 300,
  applicationNote: 1_000,
  decisionNote: 1_000,
} as const;

export function slotsInUse(input: { pending: number; acceptedInWindow: number }): number {
  return Math.max(0, input.pending) + Math.max(0, input.acceptedInWindow);
}

export type RequestRefusalCode =
  | "VALIDATION_ERROR"
  | "MENTOR_NOT_VERIFIED"
  | "MENTOR_UNAVAILABLE"
  | "MENTOR_AT_CAPACITY"
  | "DUPLICATE_PENDING_REQUEST"
  | "REQUEST_LIMIT_REACHED";

export type CanCreateRequestResult =
  | { ok: true }
  | { ok: false; code: RequestRefusalCode; message: string };

export interface CanCreateRequestInput {
  mentor: {
    userId: string;
    status: string;
    accessMode: "OPEN" | "APPLICATION_ONLY" | "PAUSED";
    level: AffiliationLevel | null;
  };
  callerUserId: string;
  hasStudentProfile: boolean;
  slotsInUse: number;
  weeklyCapacity: number;
  pendingForPair: boolean;
  pendingForStudent: number;
  applicationNote?: string | null;
  interactionType: string;
}

/**
 * Every refusal the creation path can raise, in the order the user should see:
 * addressability first, then the pair/limit, then capacity, then content.
 */
export function canCreateRequest(input: CanCreateRequestInput): CanCreateRequestResult {
  if (input.interactionType === "GROUP_OFFICE_HOURS") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "group office hours is not available in this release",
    };
  }
  if (input.callerUserId === input.mentor.userId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "you cannot request yourself as a mentor" };
  }
  if (!input.hasStudentProfile) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "save a student profile before sending a request",
    };
  }
  if (!hasLevelOne(input.mentor.level)) {
    return {
      ok: false,
      code: "MENTOR_NOT_VERIFIED",
      message: "this mentor has no verified Level 1 affiliation",
    };
  }
  if (input.mentor.accessMode === "PAUSED" || input.mentor.status !== "ACTIVE") {
    return {
      ok: false,
      code: "MENTOR_UNAVAILABLE",
      message: "this mentor is not accepting requests right now",
    };
  }
  if (input.pendingForPair) {
    return {
      ok: false,
      code: "DUPLICATE_PENDING_REQUEST",
      message: "you already have a pending request with this mentor",
    };
  }
  if (input.pendingForStudent >= MAX_PENDING_REQUESTS_PER_STUDENT) {
    return {
      ok: false,
      code: "REQUEST_LIMIT_REACHED",
      message: `you can have at most ${MAX_PENDING_REQUESTS_PER_STUDENT} pending requests`,
    };
  }
  if (input.slotsInUse >= input.weeklyCapacity) {
    return {
      ok: false,
      code: "MENTOR_AT_CAPACITY",
      message: "this mentor is at weekly capacity",
    };
  }
  if (input.mentor.accessMode === "APPLICATION_ONLY" && !input.applicationNote?.trim()) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "application_note is required for an application-only mentor",
    };
  }
  return { ok: true };
}
