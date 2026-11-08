import { strings } from "./strings";

/**
 * Pure view helpers for the outcome section (the repo has no DOM test harness,
 * so the states and labels are unit-tested here instead).
 */

const STATUS_LABELS: Record<string, string> = {
  pending_confirmation: strings.outcome.statusPending,
  confirmed: strings.outcome.statusConfirmed,
  in_platform_review: strings.outcome.statusReview,
  counted: strings.outcome.statusCounted,
  rejected: strings.outcome.statusRejected,
  withdrawn: strings.outcome.statusWithdrawn,
  reversed: strings.outcome.statusReversed,
};

export function outcomeStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const OUTCOME_TYPES = ["ADMISSION", "INTERNSHIP", "JOB_OFFER", "SKILL_MILESTONE", "INTERVIEW"] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export function outcomeTypeLabel(type: string): string {
  switch (type.toUpperCase()) {
    case "ADMISSION":
      return strings.outcome.typeAdmission;
    case "INTERNSHIP":
      return strings.outcome.typeInternship;
    case "JOB_OFFER":
      return strings.outcome.typeJobOffer;
    case "SKILL_MILESTONE":
      return strings.outcome.typeSkillMilestone;
    case "INTERVIEW":
      return strings.outcome.typeInterview;
    default:
      return type;
  }
}

export function contributionLabel(level: string | null): string | null {
  if (!level) {
    return null;
  }
  switch (level.toLowerCase()) {
    case "directly_enabled":
      return strings.outcome.contributionDirectlyEnabled;
    case "helped":
      return strings.outcome.contributionHelped;
    case "minor":
      return strings.outcome.contributionMinor;
    default:
      return level;
  }
}

/** A platform-decided outcome is labelled, never scored (D-63). */
export function platformDecidedLabel(countedBasis: string | null): string {
  return countedBasis === "platform_decision" ? strings.outcome.platformDecided : "";
}

export interface OutcomeActions {
  canConfirm: boolean;
  canDispute: boolean;
  canWithdraw: boolean;
}

export function actionsFor(status: string): OutcomeActions {
  return {
    canConfirm: status === "pending_confirmation",
    canDispute: status === "pending_confirmation",
    canWithdraw:
      status === "pending_confirmation" || status === "confirmed" || status === "in_platform_review",
  };
}

export type ReportResult = { ok: true } | { ok: false; message: string };

/** Mirrors the API's field rules so an empty description never becomes a round trip. */
export function validateReport(input: {
  description: string;
  outcomeType: string;
  contribution: string;
}): ReportResult {
  if (!input.description.trim()) {
    return { ok: false, message: strings.outcome.descriptionRequired };
  }
  if (input.description.trim().length > 2_000) {
    return { ok: false, message: strings.outcome.reportError };
  }
  if (!(OUTCOME_TYPES as readonly string[]).includes(input.outcomeType)) {
    return { ok: false, message: strings.outcome.reportError };
  }
  if (!["DIRECTLY_ENABLED", "HELPED", "MINOR"].includes(input.contribution)) {
    return { ok: false, message: strings.outcome.reportError };
  }
  return { ok: true };
}
