/**
 * The small-cohort floor (D-213). A count below the floor is a slice of one or
 * two people, so the product never publishes it: the value is omitted and the
 * metric is named in a `suppressed` list.
 */
export function withholdBelowFloor(value: number, floor: number): number | null {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("a count must be a non-negative integer");
  }
  if (!Number.isInteger(floor) || floor < 0) {
    throw new Error("the floor must be a non-negative integer");
  }
  return floor > 0 && value < floor ? null : value;
}

/** The metric keys a payload must name as suppressed, in a stable order. */
export function withheldMetrics(
  counts: Readonly<Record<string, number>>,
  floor: number,
): string[] {
  return Object.keys(counts)
    .filter((key) => withholdBelowFloor(counts[key] as number, floor) === null)
    .sort();
}
