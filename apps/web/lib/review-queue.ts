import { strings } from "./strings";

export interface ReviewCase {
  id: string;
  mentorship_id: string;
  outcome_type: string;
  description: string;
  field_name: string;
  student_name: string;
  mentor_name: string;
  case_kind: string;
  reason: string | null;
  opened_at: string;
  waiting_days: number;
  counted_basis: string | null;
}

export interface ReviewQueuePayload {
  data?: ReviewCase[];
  next_cursor?: string | null;
}

export type ReviewDecision = "valid" | "invalid";

export function caseKindLabel(kind: string): string {
  switch (kind) {
    case "mentor_dispute":
      return strings.adminReviews.kindMentorDispute;
    case "conflict_of_interest":
      return strings.adminReviews.kindConflict;
    case "escalated_d7":
      return strings.adminReviews.kindEscalated;
    default:
      return kind;
  }
}

export function waitingLabel(days: number): string {
  return strings.adminReviews.waitingDays.replace("{days}", String(Math.max(0, days)));
}

/** A decision needs a written reason; the API repeats the bound. */
export function reviewBody(
  decision: ReviewDecision,
  reason: string,
): { ok: true; body: { decision: ReviewDecision; reason: string } } | { ok: false; message: string } {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: strings.adminReviews.reasonRequired };
  }
  if (trimmed.length > 1000) {
    return { ok: false, message: strings.adminReviews.reasonTooLong };
  }
  return { ok: true, body: { decision, reason: trimmed } };
}

export function removeCase(cases: ReviewCase[], id: string): ReviewCase[] {
  return cases.filter((entry) => entry.id !== id);
}
