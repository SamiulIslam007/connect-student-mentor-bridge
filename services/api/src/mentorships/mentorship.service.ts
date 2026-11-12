import type { Cadence, MentorshipStatus, SessionStatus } from "@connect/domain";

/** Wire shapes: snake_case, lowercase enum values, ids opaque. */
export interface MentorshipRecord {
  id: string;
  requestId: string;
  studentProfileId: string;
  mentorProfileId: string;
  fieldId: string;
  status: MentorshipStatus;
  cadence: Cadence | null;
  plannedWeeks: number | null;
  goal: string | null;
  studentAckAt: Date | null;
  mentorAckAt: Date | null;
  isPaid: boolean;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  question: string;
  studentName: string;
  mentorName: string;
  /** Set by the single-mentorship read only: which side the caller is. */
  viewerRole?: "student" | "mentor";
}

export interface MessageRecord {
  id: string;
  senderUserId: string;
  senderName: string;
  body: string;
  createdAt: Date;
}

export interface MessagePage {
  messages: MessageRecord[];
  nextCursor: string | null;
}

export interface SessionRecord {
  id: string;
  mentorshipId: string;
  createdByUserId: string;
  scheduledStart: Date;
  durationMinutes: number;
  meetingUrl: string;
  status: SessionStatus;
  studentConfirmedHeldAt: Date | null;
  mentorConfirmedHeldAt: Date | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  createdAt: Date;
}

export interface ListMentorshipsInput {
  userId: string;
  status?: MentorshipStatus;
  limit: number;
}

export interface AgreementInput {
  userId: string;
  mentorshipId: string;
  cadence?: string;
  plannedWeeks?: unknown;
  goal?: string;
}

export interface ListMessagesInput {
  userId: string;
  mentorshipId: string;
  cursor?: string;
  limit: number;
}

export interface CreateSessionInput {
  userId: string;
  mentorshipId: string;
  scheduledStart?: string;
  durationMinutes?: unknown;
  meetingUrl?: string;
}

export interface SessionInput {
  userId: string;
  sessionId: string;
  reason?: string;
}

/** The break-glass reason bound, and the number the refusal message states. */
export const BREAK_GLASS_REASON_MAX_LENGTH = 1_000;

export interface BreakGlassReadInput {
  mentorshipId: string;
  actorUserId: string;
  /** Validated by the service: required, trimmed, at most the documented bound. */
  reason: unknown;
  requestId: string;
}

export interface ModerationThread {
  mentorship: MentorshipRecord;
  messages: MessageRecord[];
  sessions: SessionRecord[];
}

export interface MentorshipService {
  list(input: ListMentorshipsInput): Promise<MentorshipRecord[]>;
  /** Participant-only; a foreign id reads as not found. */
  read(userId: string, mentorshipId: string): Promise<MentorshipRecord>;
  setAgreement(input: AgreementInput): Promise<MentorshipRecord>;
  acknowledge(userId: string, mentorshipId: string): Promise<MentorshipRecord>;
  listMessages(input: ListMessagesInput): Promise<MessagePage>;
  postMessage(userId: string, mentorshipId: string, body: string): Promise<MessageRecord>;
  listSessions(userId: string, mentorshipId: string): Promise<SessionRecord[]>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  confirmHeld(userId: string, sessionId: string): Promise<SessionRecord>;
  cancelSession(input: SessionInput): Promise<SessionRecord>;
  complete(userId: string, mentorshipId: string): Promise<MentorshipRecord>;
  /**
   * The audited break-glass read (D-121): validate, resolve, write the audit
   * row, then read. Content is never returned without its audit row.
   */
  breakGlassRead(input: BreakGlassReadInput): Promise<ModerationThread>;
}

export function mentorshipPayload(mentorship: MentorshipRecord): Record<string, unknown> {
  return {
    id: mentorship.id,
    request_id: mentorship.requestId,
    status: mentorship.status.toLowerCase(),
    cadence: mentorship.cadence?.toLowerCase() ?? null,
    planned_weeks: mentorship.plannedWeeks,
    goal: mentorship.goal,
    is_paid: mentorship.isPaid,
    student_profile_id: mentorship.studentProfileId,
    mentor_profile_id: mentorship.mentorProfileId,
    field_id: mentorship.fieldId,
    student_acknowledged_at: mentorship.studentAckAt,
    mentor_acknowledged_at: mentorship.mentorAckAt,
    agreement_acknowledged:
      mentorship.studentAckAt !== null && mentorship.mentorAckAt !== null,
    started_at: mentorship.startedAt,
    ended_at: mentorship.endedAt,
    created_at: mentorship.createdAt,
    question: mentorship.question,
    student_name: mentorship.studentName,
    mentor_name: mentorship.mentorName,
    ...(mentorship.viewerRole ? { viewer_role: mentorship.viewerRole } : {}),
  };
}

export function messagePayload(message: MessageRecord): Record<string, unknown> {
  return {
    id: message.id,
    sender_user_id: message.senderUserId,
    sender_name: message.senderName,
    body: message.body,
    created_at: message.createdAt,
  };
}

export function sessionPayload(session: SessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    mentorship_id: session.mentorshipId,
    created_by_user_id: session.createdByUserId,
    scheduled_start: session.scheduledStart,
    duration_minutes: session.durationMinutes,
    meeting_url: session.meetingUrl,
    status: session.status.toLowerCase(),
    student_confirmed_held_at: session.studentConfirmedHeldAt,
    mentor_confirmed_held_at: session.mentorConfirmedHeldAt,
    cancelled_by_user_id: session.cancelledByUserId,
    cancel_reason: session.cancelReason,
    created_at: session.createdAt,
  };
}
