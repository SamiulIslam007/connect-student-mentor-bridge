import assert from "node:assert/strict";
import { test } from "node:test";

import {
  earlierCountedForPair,
  pairFactor,
  pointsToNumeric,
  replaySnapshots,
  reputationPoints,
  responseReliability,
  reversalPoints,
  snapshotDelta,
  type CountedEvent,
} from "../src/reputation.js";

const pair = { mentorProfileId: "m-1", studentProfileId: "s-1" };

test("the pair factor is one over one plus n", () => {
  assert.equal(pairFactor(0), 1);
  assert.equal(pairFactor(1), 1 / 2);
  assert.equal(pairFactor(2), 1 / 3);
  assert.equal(pairFactor(9), 1 / 10);
  for (const bad of [-1, 1.5, Number.NaN]) {
    assert.throws(() => pairFactor(bad));
  }
});

test("only earlier counted outcomes for the same pair raise n", () => {
  const events: CountedEvent[] = [
    { ...pair, fieldId: "f-1", outcomeType: "INTERNSHIP", points: 1 },
    { ...pair, fieldId: "f-1", outcomeType: "INTERVIEW", points: 1 },
    { mentorProfileId: "m-1", studentProfileId: "s-2", fieldId: "f-1", outcomeType: "ADMISSION", points: 1 },
    { mentorProfileId: "m-2", studentProfileId: "s-1", fieldId: "f-1", outcomeType: "ADMISSION", points: 1 },
  ];
  assert.equal(earlierCountedForPair(events, pair), 2);
  assert.equal(
    earlierCountedForPair(events, { mentorProfileId: "m-1", studentProfileId: "s-3" }),
    0,
    "a different student starts at zero",
  );
  assert.equal(earlierCountedForPair([], pair), 0, "a confirmed outcome is not in the ledger");
});

test("points are the product of the configured factors", () => {
  assert.equal(
    reputationPoints({
      difficultyWeight: 1,
      tierMultiplier: 1,
      contributionMultiplier: 1,
      pairFactor: 1,
    }),
    1,
  );
  assert.equal(
    reputationPoints({
      difficultyWeight: 2,
      tierMultiplier: 0.5,
      contributionMultiplier: 1.5,
      pairFactor: 1 / 3,
    }),
    0.5,
  );
  assert.throws(() =>
    reputationPoints({
      difficultyWeight: -1,
      tierMultiplier: 1,
      contributionMultiplier: 1,
      pairFactor: 1,
    }),
  );
  assert.equal(pointsToNumeric(1 / 3), "0.333333");
});

test("replay recomputes the snapshot totals deterministically", () => {
  const events: CountedEvent[] = [
    { ...pair, fieldId: "f-1", outcomeType: "INTERNSHIP", points: 1 },
    { ...pair, fieldId: "f-1", outcomeType: "INTERNSHIP", points: 0.5 },
    { ...pair, fieldId: "f-2", outcomeType: "ADMISSION", points: 1 },
  ];
  const first = replaySnapshots(events);
  const second = replaySnapshots([...events].reverse());

  assert.deepEqual(first, replaySnapshots(events));
  assert.deepEqual(first, second, "the replay does not depend on row order");
  assert.deepEqual(
    first.map((row) => [row.fieldId, row.outcomeType, row.countedCount, row.pointsTotal]),
    [
      ["f-1", "INTERNSHIP", 2, 1.5],
      ["f-2", "ADMISSION", 1, 1],
    ],
  );
});

test("a reversal is negative points and a minus-one count", () => {
  assert.equal(reversalPoints(0.5), -0.5);
  assert.equal(snapshotDelta("REVERSAL"), -1);
  assert.equal(snapshotDelta("COUNTED"), 1);
  assert.equal(snapshotDelta(undefined), 1);
  assert.throws(() => reversalPoints(Number.NaN));
});

test("replay reproduces a snapshot after a reversal", () => {
  const events: CountedEvent[] = [
    { ...pair, fieldId: "f-1", outcomeType: "INTERNSHIP", points: 1, eventType: "COUNTED" },
    {
      ...pair,
      fieldId: "f-1",
      outcomeType: "INTERNSHIP",
      points: reversalPoints(1),
      eventType: "REVERSAL",
    },
  ];
  assert.deepEqual(replaySnapshots(events), [
    {
      mentorProfileId: "m-1",
      fieldId: "f-1",
      outcomeType: "INTERNSHIP",
      countedCount: 0,
      pointsTotal: 0,
    },
  ]);
  assert.equal(earlierCountedForPair(events, pair), 1, "a reversal is not a second count");
});

function timing(status: string, createdAt: Date, decidedAt: Date | null = null) {
  return { status, createdAt, decidedAt };
}

const at = (hoursFromBase: number): Date => new Date(Date.UTC(2026, 10, 1) + hoursFromBase * 3_600_000);

test("requests decided inside the window are counted in time", () => {
  assert.deepEqual(
    responseReliability(
      [
        timing("ACCEPTED", at(0), at(2)),
        timing("DECLINED", at(0), at(47)),
        timing("ACCEPTED", at(0), at(48)),
      ],
      48,
    ),
    { decidedInTime: 3, lateOrExpired: 0 },
  );
});

test("a late decision and an expired request are late or expired", () => {
  assert.deepEqual(
    responseReliability(
      [timing("ACCEPTED", at(0), at(49)), timing("EXPIRED", at(0))],
      48,
    ),
    { decidedInTime: 0, lateOrExpired: 2 },
  );
});

test("withdrawn and pending requests increment neither bucket", () => {
  assert.deepEqual(
    responseReliability(
      [timing("WITHDRAWN", at(0)), timing("PENDING", at(0)), timing("REDIRECTED", at(0), at(3))],
      48,
    ),
    { decidedInTime: 1, lateOrExpired: 0 },
  );
});

test("a decided status without a decision timestamp increments neither", () => {
  assert.deepEqual(responseReliability([timing("ACCEPTED", at(0))], 48), {
    decidedInTime: 0,
    lateOrExpired: 0,
  });
});

test("the buckets are a partition of the decided rows", () => {
  const rows = [
    timing("ACCEPTED", at(0), at(1)),
    timing("DECLINED", at(0), at(2)),
    timing("ACCEPTED", at(0), at(72)),
    timing("EXPIRED", at(0)),
    timing("WITHDRAWN", at(0)),
    timing("PENDING", at(0)),
  ];
  const counts = responseReliability(rows, 48);
  assert.equal(counts.decidedInTime, 2);
  assert.equal(counts.lateOrExpired, 2);
  assert.ok(counts.decidedInTime + counts.lateOrExpired <= rows.length);
});

test("an invalid window is refused rather than guessed", () => {
  assert.throws(() => responseReliability([], 0), /windowHours/);
  assert.throws(() => responseReliability([], Number.NaN), /windowHours/);
});

test("an eligibility expiry is not the mentor's non-response", () => {
  // The mentor could not decide, so the row leaves both buckets alone (D-166);
  // a deadline expiry, or a row with no reason, still counts.
  assert.deepEqual(
    responseReliability(
      [
        { status: "EXPIRED", createdAt: at(0), decidedAt: null, expiryReason: "MENTOR_INELIGIBLE" },
        { status: "EXPIRED", createdAt: at(0), decidedAt: null, expiryReason: "DEADLINE" },
        { status: "EXPIRED", createdAt: at(0), decidedAt: null },
      ],
      48,
    ),
    { decidedInTime: 0, lateOrExpired: 2 },
  );
});
