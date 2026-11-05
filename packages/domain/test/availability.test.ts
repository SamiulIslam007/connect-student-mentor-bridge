import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isDiscoverable,
  MAX_AVAILABILITY_WINDOWS_PER_CONTEXT,
  sortWindows,
  validateAvailabilityWindows,
  type AvailabilityWindow,
  type AvailabilityWindowDraft,
  type MentorAccessMode,
  type MentorStatus,
} from "../src/index.js";

function window(overrides: Partial<AvailabilityWindowDraft> = {}): AvailabilityWindowDraft {
  return {
    weekday: 1,
    startMinute: 540,
    endMinute: 660,
    timezone: "Asia/Dhaka",
    ...overrides,
  };
}

test("a valid weekly set has no problems", () => {
  assert.deepEqual(
    validateAvailabilityWindows([
      window(),
      window({ weekday: 3, startMinute: 600, endMinute: 720 }),
      window({ weekday: 3, startMinute: 720, endMinute: 780 }),
    ]),
    [],
  );
});

test("each numeric rule is refused with its own problem", () => {
  assert.match(validateAvailabilityWindows([window({ weekday: 0 })])[0], /weekday/);
  assert.match(validateAvailabilityWindows([window({ weekday: 8 })])[0], /weekday/);
  assert.match(validateAvailabilityWindows([window({ weekday: "1" })])[0], /weekday/);
  assert.match(validateAvailabilityWindows([window({ startMinute: -1 })])[0], /start minute/);
  assert.match(validateAvailabilityWindows([window({ startMinute: 1441 })])[0], /start minute/);
  assert.match(validateAvailabilityWindows([window({ endMinute: 1441 })])[0], /end minute/);
  assert.match(
    validateAvailabilityWindows([window({ startMinute: 600, endMinute: 600 })])[0],
    /after the start minute/,
  );
  assert.match(
    validateAvailabilityWindows([window({ startMinute: 700, endMinute: 600 })])[0],
    /after the start minute/,
  );
});

test("an unknown time zone is refused and a real one is accepted", () => {
  assert.match(
    validateAvailabilityWindows([window({ timezone: "Mars/Olympus" })])[0],
    /valid IANA zone/,
  );
  assert.match(validateAvailabilityWindows([window({ timezone: 42 })])[0], /valid IANA zone/);
  assert.deepEqual(validateAvailabilityWindows([window({ timezone: "Europe/Lisbon" })]), []);
});

test("overlapping windows on one weekday are refused, touching ones are allowed", () => {
  const overlapping = validateAvailabilityWindows([
    window({ startMinute: 540, endMinute: 660 }),
    window({ startMinute: 600, endMinute: 700 }),
  ]);
  assert.equal(overlapping.length, 1);
  assert.match(overlapping[0], /overlap on weekday 1/);

  assert.deepEqual(
    validateAvailabilityWindows([
      window({ startMinute: 540, endMinute: 600 }),
      window({ startMinute: 600, endMinute: 660 }),
    ]),
    [],
  );

  // The same minutes on a different weekday do not overlap.
  assert.deepEqual(
    validateAvailabilityWindows([
      window({ weekday: 1, startMinute: 540, endMinute: 660 }),
      window({ weekday: 2, startMinute: 540, endMinute: 660 }),
    ]),
    [],
  );
});

test("the cap is refused and names its value", () => {
  const windows = Array.from({ length: MAX_AVAILABILITY_WINDOWS_PER_CONTEXT }, (_, index) =>
    window({ weekday: (index % 7) + 1, startMinute: index * 10, endMinute: index * 10 + 5 }),
  );
  assert.deepEqual(validateAvailabilityWindows(windows), []);

  const over = [...windows, window({ weekday: 7, startMinute: 1400, endMinute: 1440 })];
  const problems = validateAvailabilityWindows(over);
  assert.ok(problems.some((problem) => problem.includes(String(MAX_AVAILABILITY_WINDOWS_PER_CONTEXT))));
});

test("windows sort stably by weekday, start, then end", () => {
  const input: AvailabilityWindow[] = [
    { weekday: 3, startMinute: 600, endMinute: 660, timezone: "Asia/Dhaka" },
    { weekday: 1, startMinute: 720, endMinute: 780, timezone: "Asia/Dhaka" },
    { weekday: 1, startMinute: 540, endMinute: 660, timezone: "Asia/Dhaka" },
    { weekday: 1, startMinute: 540, endMinute: 600, timezone: "Asia/Dhaka" },
  ];

  assert.deepEqual(
    sortWindows(input).map((entry) => [entry.weekday, entry.startMinute, entry.endMinute]),
    [
      [1, 540, 600],
      [1, 540, 660],
      [1, 720, 780],
      [3, 600, 660],
    ],
  );
  assert.equal(input[0].weekday, 3, "the input array is not mutated");
});

test("discoverability covers the whole access-mode by status product", () => {
  const accessModes: MentorAccessMode[] = ["OPEN", "APPLICATION_ONLY", "PAUSED"];
  const statuses: MentorStatus[] = ["DRAFT", "PENDING", "ACTIVE", "SUSPENDED", "REMOVED"];
  const answers: Record<string, boolean> = {};

  for (const accessMode of accessModes) {
    for (const status of statuses) {
      const expected = accessMode !== "PAUSED" && status === "ACTIVE";
      assert.equal(isDiscoverable({ accessMode, status }), expected, `${accessMode}/${status}`);
      answers[`${accessMode}/${status}`] = isDiscoverable({ accessMode, status });
    }
  }

  assert.equal(Object.keys(answers).length, 15);
  assert.equal(answers["OPEN/ACTIVE"], true);
  assert.equal(answers["APPLICATION_ONLY/ACTIVE"], true);
  assert.equal(answers["PAUSED/ACTIVE"], false);
  assert.equal(answers["OPEN/DRAFT"], false);
});
