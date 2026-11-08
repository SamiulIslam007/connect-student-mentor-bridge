/**
 * Mentorship, thread, and session rules (spec: mentorship/thread-and-sessions).
 * Pure: no database or HTTP import, so the API and the web app cannot disagree.
 */

export const MENTORSHIP_STATUSES = ["ACTIVE", "COMPLETED", "ENDED_EARLY"] as const;
export type MentorshipStatus = (typeof MENTORSHIP_STATUSES)[number];

/** `ENDED_EARLY` and `AD_HOC` are stored values with no route in this change. */
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "AD_HOC"] as const;
export type Cadence = (typeof CADENCES)[number];

export const SESSION_STATUSES = ["SCHEDULED", "HELD", "CANCELLED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** The request's `context_summary` bound (design open question: 2 000). */
export const MENTORSHIP_FIELD_LIMITS = {
  message: 2_000,
  goal: 2_000,
  cancelReason: 500,
} as const;

export const SESSION_DURATION_MINUTES = { min: 15, max: 240 } as const;
export const PLANNED_WEEKS = { min: 1, max: 52 } as const;

/** Only a live mentorship can be acknowledged or completed. */
export function canAcknowledge(status: MentorshipStatus): boolean {
  return status === "ACTIVE";
}

export function canComplete(status: MentorshipStatus): boolean {
  return status === "ACTIVE";
}

/**
 * `HELD` is derived from both confirmation timestamps rather than written by a
 * caller; a terminal session keeps its status (design D5).
 */
export function nextSessionStatus(
  status: SessionStatus,
  confirmations: { student: boolean; mentor: boolean },
): SessionStatus | null {
  if (status !== "SCHEDULED") {
    return null;
  }
  return confirmations.student && confirmations.mentor ? "HELD" : "SCHEDULED";
}

/** A meeting link is mentor-provided display text; only `https://` is accepted. */
export function isHttpsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("https://")) {
    return false;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}
