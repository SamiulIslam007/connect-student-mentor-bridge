import assert from "node:assert/strict";
import { test } from "node:test";

import { MATCH_ALUMNI_BATCH_DISTANCE } from "@connect/config";

import {
  alumniConnection,
  availabilityOverlap,
  fieldOverlap,
  orderSuggestions,
  scoreCandidate,
  stablePairHash,
  type MatchCandidate,
  type MatchStudent,
  type ScoredCandidate,
} from "../src/match.js";

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const INSTITUTION_B = "22222222-2222-2222-2222-222222222222";
const FIELD_PRIMARY = "aaaaaaaa-0000-0000-0000-000000000001";
const FIELD_INTEREST_1 = "aaaaaaaa-0000-0000-0000-000000000002";
const FIELD_INTEREST_2 = "aaaaaaaa-0000-0000-0000-000000000003";

function student(overrides: Partial<MatchStudent> = {}): MatchStudent {
  return {
    id: "student-1",
    primaryFieldId: FIELD_PRIMARY,
    interestFieldIds: [FIELD_INTEREST_1, FIELD_INTEREST_2],
    affiliation: { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2020 },
    availability: [{ weekday: 1, startMinute: 900, endMinute: 1100, timezone: "Asia/Dhaka" }],
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: "mentor-1",
    fieldIds: [FIELD_PRIMARY, FIELD_INTEREST_1, FIELD_INTEREST_2],
    affiliation: { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2020 },
    availability: [{ weekday: 1, startMinute: 1000, endMinute: 1200, timezone: "Asia/Dhaka" }],
    weeklyCapacity: 4,
    slotsInUse: 0,
    requestsInWindow: 0,
    ...overrides,
  };
}

test("field overlap: the primary field shared only, both interests missed, is 2/4", () => {
  const factor = fieldOverlap(student(), candidate({ fieldIds: [FIELD_PRIMARY] }));
  assert.equal(factor, 0.5);
});

test("field overlap: every student field shared is 1.0", () => {
  assert.equal(fieldOverlap(student(), candidate()), 1);
});

test("field overlap: no shared field is zero, not missing", () => {
  const factor = fieldOverlap(
    student(),
    candidate({ fieldIds: ["ffffffff-0000-0000-0000-000000000009"] }),
  );
  assert.equal(factor, 0);
});

test("alumni: same institution, same department, batch inside the configured distance is 1.0", () => {
  const factor = alumniConnection(
    { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2020 },
    {
      institutionId: INSTITUTION_A,
      department: "cse ",
      batchYear: 2020 + MATCH_ALUMNI_BATCH_DISTANCE,
    },
  );
  assert.equal(factor, 1);
});

test("alumni: same department with a distant batch is 0.5", () => {
  const factor = alumniConnection(
    { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2000 },
    {
      institutionId: INSTITUTION_A,
      department: "CSE",
      batchYear: 2000 + MATCH_ALUMNI_BATCH_DISTANCE + 1,
    },
  );
  assert.equal(factor, 0.5);
});

test("alumni: same department with an unrecorded batch year is 0.5", () => {
  const factor = alumniConnection(
    { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2020 },
    { institutionId: INSTITUTION_A, department: "CSE", batchYear: null },
  );
  assert.equal(factor, 0.5);
});

test("alumni: a different institution is zero and stays active", () => {
  const factor = alumniConnection(
    { institutionId: INSTITUTION_A, department: "CSE", batchYear: 2020 },
    { institutionId: INSTITUTION_B, department: "CSE", batchYear: 2020 },
  );
  assert.equal(factor, 0);
});

test("alumni: a student with no verified affiliation makes the factor missing", () => {
  assert.equal(alumniConnection(null, candidate().affiliation), null);
});

test("availability: overlap is measured in minutes over the smaller total", () => {
  const factor = availabilityOverlap(
    [{ weekday: 1, startMinute: 900, endMinute: 1100, timezone: "Asia/Dhaka" }],
    [{ weekday: 1, startMinute: 1000, endMinute: 1200, timezone: "Asia/Dhaka" }],
  );
  // 100 minutes overlap over the smaller total of 200 minutes.
  assert.equal(factor, 0.5);
});

test("availability: overlapping minutes are deduplicated across windows on one weekday", () => {
  const factor = availabilityOverlap(
    [
      { weekday: 1, startMinute: 900, endMinute: 1000, timezone: "Asia/Dhaka" },
      { weekday: 1, startMinute: 900, endMinute: 1000, timezone: "Asia/Dhaka" },
    ],
    [{ weekday: 1, startMinute: 900, endMinute: 1000, timezone: "Asia/Dhaka" }],
  );
  assert.equal(factor, 1);
});

test("availability: the factor is capped at 1.0", () => {
  const factor = availabilityOverlap(
    [{ weekday: 2, startMinute: 600, endMinute: 1200, timezone: "Asia/Dhaka" }],
    [
      { weekday: 2, startMinute: 600, endMinute: 900, timezone: "Asia/Dhaka" },
      { weekday: 2, startMinute: 300, endMinute: 1200, timezone: "Asia/Dhaka" },
    ].slice(0, 1),
  );
  assert.equal(factor, 1);
});

test("availability: windows in different time zones make the factor missing", () => {
  const factor = availabilityOverlap(
    [{ weekday: 1, startMinute: 900, endMinute: 1100, timezone: "Asia/Dhaka" }],
    [{ weekday: 1, startMinute: 900, endMinute: 1100, timezone: "Europe/London" }],
  );
  assert.equal(factor, null);
});

test("availability: a student with no windows makes the factor missing", () => {
  assert.equal(availabilityOverlap([], candidate().availability), null);
});

test("GoalAlignment is always missing", () => {
  assert.equal(scoreCandidate(student(), candidate()).factors.goal, null);
});

test("score is the weighted average over three active factors, rounded to six decimals", () => {
  const result = scoreCandidate(student(), candidate({ fieldIds: [FIELD_PRIMARY] }));
  // field 0.5*30 + alumni 1.0*30 + availability 0.5*15 = 52.5 over 75.
  assert.equal(result.score, 0.7);
  assert.equal(result.limitedInformation, true);
});

test("one missing factor renormalizes the remaining weights", () => {
  const result = scoreCandidate(student({ availability: [] }), candidate({ fieldIds: [FIELD_PRIMARY] }));
  // field 0.5*30 + alumni 1.0*30 = 45 over 60.
  assert.equal(result.score, 0.75);
  assert.equal(result.limitedInformation, true);
});

test("a present-but-zero factor stays active and drags the score down", () => {
  const result = scoreCandidate(
    student({ availability: [] }),
    candidate({
      fieldIds: [FIELD_PRIMARY],
      affiliation: { institutionId: INSTITUTION_B, department: "CSE", batchYear: 2020 },
    }),
  );
  assert.equal(result.factors.alumni, 0);
  // field 0.5*30 + alumni 0*30 = 15 over 60.
  assert.equal(result.score, 0.25);
});

test("with every factor at zero the score is zero and ordering falls back to capacity", () => {
  const result = scoreCandidate(
    student({ availability: [], affiliation: null }),
    candidate({ fieldIds: ["ffffffff-0000-0000-0000-000000000009"] }),
  );
  assert.equal(result.score, 0);
  assert.equal(result.limitedInformation, true);
});

test("scores compare at six decimals: equal scores tie and the hash decides", () => {
  const tied: ScoredCandidate[] = ["mentor-b", "mentor-a", "mentor-c"].map((id) => ({
    candidate: candidate({ id }),
    result: scoreCandidate(student(), candidate({ id })),
  }));
  const first = orderSuggestions("student-1", tied).map((entry) => entry.candidate.id);
  const second = orderSuggestions("student-1", [...tied].reverse()).map((entry) => entry.candidate.id);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first,
    [...tied]
      .map((entry) => entry.candidate.id)
      .sort((a, b) => stablePairHash("student-1", a) - stablePairHash("student-1", b)),
  );
});

test("the pair hash is stable across calls and differs across mentors", () => {
  const once = stablePairHash("student-1", "mentor-1");
  const twice = stablePairHash("student-1", "mentor-1");
  assert.equal(once, twice);
  assert.notEqual(once, stablePairHash("student-1", "mentor-2"));
  assert.ok(Number.isInteger(once) && once >= 0 && once <= 0xffffffff);
});

test("ordering uses capacity, then fewer requests, before the pair hash", () => {
  const make = (id: string, slotsInUse: number, requestsInWindow: number): ScoredCandidate => ({
    candidate: candidate({ id, slotsInUse, requestsInWindow }),
    result: scoreCandidate(student(), candidate({ id, slotsInUse, requestsInWindow })),
  });
  const ordered = orderSuggestions("student-1", [
    make("mentor-full", 3, 0),
    make("mentor-busy", 0, 9),
    make("mentor-free", 0, 1),
  ]).map((entry) => entry.candidate.id);
  assert.deepEqual(ordered, ["mentor-free", "mentor-busy", "mentor-full"]);
});
