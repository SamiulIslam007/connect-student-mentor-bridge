import { strings } from "./strings";

/**
 * The impact section's pure view model: counts only, and no field that could
 * become a score, tier, percentage, or ranking (design D8).
 */

export interface ImpactRow {
  field_id: string;
  field_name: string;
  outcome_type: string;
  count: number;
}

export interface ImpactReport {
  data: ImpactRow[];
  counted_outcomes: number;
  /** Requests the mentor decided inside the window (D-114, D-116). */
  requests_decided_in_time: number;
  requests_late_or_expired: number;
}

/**
 * Below the configured sample the two counts are replaced by one line (D-117).
 * A pure helper so the rule is testable without a renderer, like `impactState`.
 */
export type ReliabilityState = "hidden" | "shown";

export function reliabilityState(
  report: Pick<ImpactReport, "requests_decided_in_time" | "requests_late_or_expired">,
  minimum: number,
): ReliabilityState {
  return report.requests_decided_in_time + report.requests_late_or_expired < minimum
    ? "hidden"
    : "shown";
}

export type ImpactState = "loading" | "error" | "empty" | "ready";

export function impactState(input: {
  loaded: boolean;
  failed: boolean;
  rows: readonly ImpactRow[];
}): ImpactState {
  if (!input.loaded) {
    return "loading";
  }
  if (input.failed) {
    return "error";
  }
  return input.rows.length === 0 ? "empty" : "ready";
}

const OUTCOME_LABELS: Record<string, string> = {
  admission: strings.impact.outcomeAdmission,
  internship: strings.impact.outcomeInternship,
  job_offer: strings.impact.outcomeJobOffer,
  skill_milestone: strings.impact.outcomeSkillMilestone,
  interview: strings.impact.outcomeInterview,
};

export function outcomeLabel(outcomeType: string): string {
  return OUTCOME_LABELS[outcomeType.toLowerCase()] ?? outcomeType;
}

/** The rendered rows carry exactly these keys: a reader cannot see a score. */
export const IMPACT_ROW_KEYS = ["field_name", "outcome_type", "count"] as const;

export function renderRows(report: ImpactReport): { field: string; type: string; count: string }[] {
  return report.data.map((row) => ({
    field: row.field_name,
    type: outcomeLabel(row.outcome_type),
    count: String(row.count),
  }));
}

/** A number that would read as a score is refused here, not rendered. */
export function hasScoreKey(payload: Record<string, unknown>): boolean {
  return ["score", "points", "tier", "ranking", "percentage"].some((key) => key in payload);
}
