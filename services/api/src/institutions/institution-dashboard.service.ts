import { INSTITUTION_COHORT_FLOOR } from "@connect/config";
import { withheldMetrics, withholdBelowFloor } from "@connect/domain";

/**
 * The `FR-INST-02` aggregate read for one institution (design R1/R3): integers
 * only, one query per metric group, and every count below the floor withheld.
 *
 * The timing pair mirrors `responseReliability` in `@connect/domain`; the
 * `requests_decided` count is the design's set (an accepted, declined or expired
 * request), so a mentor-ineligible expiry is decided but is not the mentor's
 * late response (D-166).
 */
export interface InstitutionAggregateCounts {
  verifiedAlumni: number;
  activeMentors: number;
  requestsReceived: number;
  requestsAccepted: number;
  requestsDecided: number;
  requestsDecidedInTime: number;
  requestsLateOrExpired: number;
  outcomesReported: number;
  outcomesConfirmed: number;
  countedOutcomesByField: { fieldId: string; fieldName: string; counted: number }[];
}

export interface InstitutionDashboardService {
  /** Every metric is scoped to the institution by the query itself. */
  aggregates(institutionId: string): Promise<InstitutionAggregateCounts>;
}

export const INSTITUTION_DASHBOARD_SERVICE = "INSTITUTION_DASHBOARD_SERVICE";

/** The wire keys, in payload order; the integration test freezes the key set. */
const METRICS: readonly { key: string; read: (counts: InstitutionAggregateCounts) => number }[] = [
  { key: "verified_alumni", read: (counts) => counts.verifiedAlumni },
  { key: "active_mentors", read: (counts) => counts.activeMentors },
  { key: "requests_received", read: (counts) => counts.requestsReceived },
  { key: "requests_accepted", read: (counts) => counts.requestsAccepted },
  { key: "requests_decided", read: (counts) => counts.requestsDecided },
  { key: "requests_decided_in_time", read: (counts) => counts.requestsDecidedInTime },
  { key: "requests_late_or_expired", read: (counts) => counts.requestsLateOrExpired },
  { key: "outcomes_reported", read: (counts) => counts.outcomesReported },
  { key: "outcomes_confirmed", read: (counts) => counts.outcomesConfirmed },
];

export function institutionAggregatesPayload(
  institutionId: string,
  counts: InstitutionAggregateCounts,
): Record<string, unknown> {
  const values: Record<string, number> = {};
  for (const metric of METRICS) {
    values[metric.key] = metric.read(counts);
  }

  const payload: Record<string, unknown> = { institution_id: institutionId };
  for (const metric of METRICS) {
    const value = withholdBelowFloor(values[metric.key] as number, INSTITUTION_COHORT_FLOOR);
    if (value !== null) {
      payload[metric.key] = value;
    }
  }

  // A by-field row below the floor is omitted entirely; no field id is named.
  payload.counted_outcomes_by_field = counts.countedOutcomesByField
    .filter((row) => withholdBelowFloor(row.counted, INSTITUTION_COHORT_FLOOR) !== null)
    .map((row) => ({ field_id: row.fieldId, field_name: row.fieldName, counted: row.counted }));
  payload.suppressed = withheldMetrics(values, INSTITUTION_COHORT_FLOOR);
  return payload;
}
