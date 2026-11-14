/**
 * The reputation formula (docs/reputation-and-verification-policy.md §7). Pure:
 * the counting job and the replay test cannot disagree. Every weight arrives as
 * a parameter, because the policy keeps them Open (design D1).
 */

/** `1 / (1 + n)`, where `n` is the pair's earlier counted outcomes (D8/§7). */
export function pairFactor(earlierCounted: number): number {
  if (!Number.isInteger(earlierCounted) || earlierCounted < 0) {
    throw new Error("earlierCounted must be a non-negative integer");
  }
  return 1 / (1 + earlierCounted);
}

export interface ReputationFactors {
  difficultyWeight: number;
  tierMultiplier: number;
  contributionMultiplier: number;
  pairFactor: number;
}

/** The product of the four factors; the caller stores it as `numeric(12,6)`. */
export function reputationPoints({
  difficultyWeight,
  tierMultiplier,
  contributionMultiplier,
  pairFactor: pair,
}: ReputationFactors): number {
  for (const [name, value] of Object.entries({
    difficultyWeight,
    tierMultiplier,
    contributionMultiplier,
    pairFactor: pair,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number`);
    }
  }
  return difficultyWeight * tierMultiplier * contributionMultiplier * pair;
}

/** Six decimals, matching the `numeric(12,6)` column. */
export function pointsToNumeric(points: number): string {
  return points.toFixed(6);
}

export interface PairKey {
  mentorProfileId: string;
  studentProfileId: string;
}

export interface CountedEvent extends PairKey {
  fieldId: string;
  outcomeType: string;
  points: number;
  /** Absent reads as a first `COUNTED` event (the pre-reversal ledger). */
  eventType?: "COUNTED" | "REVERSAL";
}

/** A reversal carries the negated points of the original event (T11). */
export function reversalPoints(points: number): number {
  if (!Number.isFinite(points)) {
    throw new Error("points must be a finite number");
  }
  return -points;
}

/** The snapshot moves by one count in the event's direction. */
export function snapshotDelta(eventType: CountedEvent["eventType"]): 1 | -1 {
  return eventType === "REVERSAL" ? -1 : 1;
}

/**
 * How many counted outcomes the pair already has. Only counted events exist in
 * the ledger, so a confirmed-but-uncounted outcome can never raise `n`.
 */
export function earlierCountedForPair(events: readonly CountedEvent[], pair: PairKey): number {
  return events.filter(
    (event) =>
      event.eventType !== "REVERSAL" &&
      event.mentorProfileId === pair.mentorProfileId &&
      event.studentProfileId === pair.studentProfileId,
  ).length;
}

export interface SnapshotTotal {
  mentorProfileId: string;
  fieldId: string;
  outcomeType: string;
  countedCount: number;
  pointsTotal: number;
}

/**
 * Recomputes the snapshot rows from the ledger, in a stable key order, so a
 * replay test can compare byte for byte (design D3/D4).
 */
export function replaySnapshots(events: readonly CountedEvent[]): SnapshotTotal[] {
  const totals = new Map<string, SnapshotTotal>();
  for (const event of events) {
    const key = `${event.mentorProfileId}|${event.fieldId}|${event.outcomeType}`;
    const direction = snapshotDelta(event.eventType);
    const current = totals.get(key);
    if (current) {
      current.countedCount += direction;
      current.pointsTotal += event.points;
      continue;
    }
    totals.set(key, {
      mentorProfileId: event.mentorProfileId,
      fieldId: event.fieldId,
      outcomeType: event.outcomeType,
      countedCount: direction,
      pointsTotal: event.points,
    });
  }
  return [...totals.values()].sort((left, right) =>
    `${left.mentorProfileId}|${left.fieldId}|${left.outcomeType}`.localeCompare(
      `${right.mentorProfileId}|${right.fieldId}|${right.outcomeType}`,
    ),
  );
}

/**
 * Response reliability (FR-REP-04, D-114 to D-116): a partition of a mentor's
 * requests into decided-in-time and late-or-expired. Pure, all-time, and the
 * window arrives as an argument so the sweeper and this rule keep one source.
 * A row increments at most one bucket, which is what makes "never both"
 * structural rather than asserted. PENDING and WITHDRAWN increment neither.
 */
export interface RequestTimingRow {
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** `DEADLINE` or `MENTOR_INELIGIBLE`; absent on a request that never expired. */
  expiryReason?: string | null;
}

export interface ResponseReliability {
  decidedInTime: number;
  lateOrExpired: number;
}

/** Statuses that mean the mentor answered (REDIRECTED is a Phase 1b decision). */
const DECIDED_STATUSES: readonly string[] = ["ACCEPTED", "DECLINED", "REDIRECTED"];

export function responseReliability(
  requests: readonly RequestTimingRow[],
  windowHours: number,
): ResponseReliability {
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new Error("windowHours must be a positive number");
  }
  const windowMs = windowHours * 60 * 60 * 1000;
  let decidedInTime = 0;
  let lateOrExpired = 0;

  for (const request of requests) {
    if (request.status === "EXPIRED") {
      // The mentor could not decide, so the expiry is not their non-response
      // (D-166). Every other expiry — the deadline, or a row with no reason —
      // counts exactly as before.
      if (request.expiryReason === "MENTOR_INELIGIBLE") {
        continue;
      }
      lateOrExpired += 1;
      continue;
    }
    if (!request.decidedAt || !DECIDED_STATUSES.includes(request.status)) {
      continue;
    }
    const elapsed = request.decidedAt.getTime() - request.createdAt.getTime();
    if (elapsed <= windowMs) {
      decidedInTime += 1;
    } else {
      lateOrExpired += 1;
    }
  }

  return { decidedInTime, lateOrExpired };
}
