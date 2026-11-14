import type { RequestStatus, RequestAction } from "@connect/domain";

/** Wire shapes: snake_case, lowercase enum values, ids opaque. */
export interface RequestRecord {
  id: string;
  status: RequestStatus;
  interactionType: "ASYNC_THREAD" | "ONE_TO_ONE_SESSION" | "GROUP_OFFICE_HOURS";
  timeframe: "WITHIN_1_MONTH" | "ONE_TO_3_MONTHS" | "THREE_TO_6_MONTHS" | "OVER_6_MONTHS";
  question: string;
  contextSummary: string;
  targetOutcome: string;
  applicationNote: string | null;
  decisionNote: string | null;
  studentProfileId: string;
  mentorProfileId: string;
  studentName: string;
  mentorName: string;
  createdAt: Date;
  expiresAt: Date;
  /** `DEADLINE` or `MENTOR_INELIGIBLE`; null while open (D-166). */
  expiryReason: string | null;
  decidedAt: Date | null;
  reminderSentAt: Date | null;
  /** Set once the request is accepted; null before that and after a decline. */
  mentorshipId: string | null;
}

export interface CreateRequestInput {
  userId: string;
  mentorProfileId: string;
  question: string;
  contextSummary: string;
  targetOutcome: string;
  timeframe: RequestRecord["timeframe"];
  interactionType?: RequestRecord["interactionType"];
  applicationNote?: string;
  requestId: string;
}

export type RequestListRole = "sent" | "received";

export interface ListRequestsInput {
  userId: string;
  role: RequestListRole;
  status?: RequestStatus;
  cursor?: string;
  limit: number;
}

export interface RequestPage {
  requests: RequestRecord[];
  nextCursor: string | null;
}

export interface DecideRequestInput {
  userId: string;
  requestId: string;
  action: Extract<RequestAction, "accept" | "decline">;
  note?: string;
  requestIdHeader: string;
}

export interface WithdrawRequestInput {
  userId: string;
  requestId: string;
  requestIdHeader: string;
}

export interface RequestsService {
  create(input: CreateRequestInput): Promise<RequestRecord>;
  list(input: ListRequestsInput): Promise<RequestPage>;
  /** Participant-only; a foreign id reads as not found. */
  read(userId: string, requestId: string): Promise<RequestRecord>;
  decide(input: DecideRequestInput): Promise<RequestRecord>;
  withdraw(input: WithdrawRequestInput): Promise<RequestRecord>;
}

export function requestPayload(request: RequestRecord): Record<string, unknown> {
  return {
    id: request.id,
    status: request.status.toLowerCase(),
    interaction_type: request.interactionType.toLowerCase(),
    timeframe: request.timeframe.toLowerCase(),
    question: request.question,
    context_summary: request.contextSummary,
    target_outcome: request.targetOutcome,
    application_note: request.applicationNote,
    decision_note: request.decisionNote,
    student_profile_id: request.studentProfileId,
    mentor_profile_id: request.mentorProfileId,
    student_name: request.studentName,
    mentor_name: request.mentorName,
    created_at: request.createdAt,
    expires_at: request.expiresAt,
    expiry_reason: request.expiryReason,
    decided_at: request.decidedAt,
    reminder_sent_at: request.reminderSentAt,
    mentorship_id: request.mentorshipId,
  };
}
