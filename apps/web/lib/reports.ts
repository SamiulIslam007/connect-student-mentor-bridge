import { strings } from "./strings";

/** The reasons the API accepts, in the order the form shows them. */
export const REPORT_REASON_OPTIONS = [
  { value: "harassment", label: strings.report.reasonHarassment },
  { value: "spam", label: strings.report.reasonSpam },
  { value: "impersonation", label: strings.report.reasonImpersonation },
  { value: "misrepresentation", label: strings.report.reasonMisrepresentation },
  { value: "other", label: strings.report.reasonOther },
] as const;

/**
 * Only a participant sees the control: the thread read is participant-scoped,
 * and a report on a message the viewer cannot see would be a 404 anyway.
 */
export function showReportControl(viewerRole: string | undefined): boolean {
  return viewerRole === "student" || viewerRole === "mentor";
}

/** The reason labels for the admin queue's target-kind column. */
export function targetKindLabel(kind: string): string {
  switch (kind) {
    case "user":
      return strings.adminReports.targetUser;
    case "message":
      return strings.adminReports.targetMessage;
    case "profile":
      return strings.adminReports.targetProfile;
    case "outcome":
      return strings.adminReports.targetOutcome;
    default:
      return kind;
  }
}

/**
 * The break-glass read's payload (D-122). The summary is pure so the rendering
 * rule is testable without a renderer.
 */
export interface ThreadMessageView {
  id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface ThreadSessionView {
  id: string;
  scheduled_start: string;
  duration_minutes: number;
  status: string;
}

export interface ThreadView {
  mentorship_id: string;
  status: string;
  agreement: {
    cadence: string | null;
    planned_weeks: number | null;
    goal: string | null;
    agreement_acknowledged: boolean;
  };
  sessions: ThreadSessionView[];
  messages: ThreadMessageView[];
  truncated: boolean;
}

export interface ThreadSummary {
  messageCount: number;
  firstAt: string | null;
  lastAt: string | null;
  agreementPresent: boolean;
  sessionCount: number;
}

/** The action is offered only where a mentorship id exists, i.e. a message target. */
export function canReadThread(targetKind: string, mentorshipId: string | null): boolean {
  return targetKind === "message" && typeof mentorshipId === "string" && mentorshipId.length > 0;
}

export function threadSummary(thread: ThreadView): ThreadSummary {
  const created = thread.messages
    .map((message) => message.created_at)
    .filter((value): value is string => typeof value === "string")
    .sort();
  return {
    messageCount: thread.messages.length,
    firstAt: created[0] ?? null,
    lastAt: created.length > 0 ? created[created.length - 1] : null,
    agreementPresent:
      thread.agreement.agreement_acknowledged || Boolean(thread.agreement.goal),
    sessionCount: thread.sessions.length,
  };
}

/** A malformed payload reads as an empty thread, never a crash. */
export function threadView(payload: unknown): ThreadView | null {
  const value = payload as Partial<ThreadView> | null;
  if (!value || typeof value.mentorship_id !== "string") {
    return null;
  }
  return {
    mentorship_id: value.mentorship_id,
    status: typeof value.status === "string" ? value.status : "",
    agreement: {
      cadence: value.agreement?.cadence ?? null,
      planned_weeks: value.agreement?.planned_weeks ?? null,
      goal: value.agreement?.goal ?? null,
      agreement_acknowledged: value.agreement?.agreement_acknowledged === true,
    },
    messages: Array.isArray(value.messages) ? value.messages : [],
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    truncated: value.truncated === true,
  };
}
