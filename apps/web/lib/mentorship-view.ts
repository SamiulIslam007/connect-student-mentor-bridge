import { strings } from "./strings";

/**
 * The mentorship page's pure view model, so the loading, empty, error and
 * signed-out states are testable without a DOM (the repo has no browser test
 * harness).
 */

export type PageState = "loading" | "signed-out" | "not-found" | "error" | "ready";

export interface PageInput {
  signedOut: boolean;
  notFound: boolean;
  failed: boolean;
  loaded: boolean;
}

export function pageState({ signedOut, notFound, failed, loaded }: PageInput): PageState {
  if (signedOut) {
    return "signed-out";
  }
  if (!loaded) {
    return "loading";
  }
  if (notFound) {
    return "not-found";
  }
  return failed ? "error" : "ready";
}

export function pageStateMessage(state: PageState): string | null {
  switch (state) {
    case "loading":
      return strings.mentorship.loading;
    case "signed-out":
      return strings.mentorship.signedOut;
    case "not-found":
      return strings.mentorship.notFound;
    case "error":
      return strings.mentorship.loadError;
    case "ready":
      return null;
  }
}

/** The documented maximum in `packages/contracts/openapi.yaml` (`body`). */
export const MESSAGE_MAX_LENGTH = 2_000;

export type ComposeResult = { ok: true; body: string } | { ok: false; message: string };

export function composeMessage(input: string): ComposeResult {
  const body = input.trim();
  if (!body) {
    return { ok: false, message: strings.mentorship.messageRequired };
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, message: strings.mentorship.messageTooLong };
  }
  return { ok: true, body };
}

const MENTORSHIP_STATUS_LABELS: Record<string, string> = {
  active: strings.mentorship.statusActive,
  completed: strings.mentorship.statusCompleted,
  ended_early: strings.mentorship.statusEndedEarly,
};

const CADENCE_LABELS: Record<string, string> = {
  weekly: strings.mentorship.cadenceWeekly,
  biweekly: strings.mentorship.cadenceBiweekly,
  monthly: strings.mentorship.cadenceMonthly,
  ad_hoc: strings.mentorship.cadenceAdHoc,
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: strings.mentorship.sessionScheduled,
  held: strings.mentorship.sessionHeld,
  cancelled: strings.mentorship.sessionCancelled,
};

export function mentorshipStatusLabel(status: string): string {
  return MENTORSHIP_STATUS_LABELS[status] ?? status;
}

export function cadenceLabel(cadence: string | null): string {
  return cadence ? (CADENCE_LABELS[cadence] ?? cadence) : strings.mentorship.cadenceNotSet;
}

export function sessionStatusLabel(status: string): string {
  return SESSION_STATUS_LABELS[status] ?? status;
}

/** The agreement state is derived from the two acknowledgement timestamps. */
export function agreementState(
  studentAckAt: string | null,
  mentorAckAt: string | null,
  viewerIsStudent: boolean,
): string | null {
  if (studentAckAt && mentorAckAt) {
    return strings.mentorship.acknowledgedBoth;
  }
  const mine = viewerIsStudent ? studentAckAt : mentorAckAt;
  return mine ? strings.mentorship.acknowledgedByYou : null;
}

/** A session is actionable only while it is `SCHEDULED`. */
export function canConfirmSession(status: string): boolean {
  return status === "scheduled";
}

export function canCompleteMentorship(status: string): boolean {
  return status === "active";
}
