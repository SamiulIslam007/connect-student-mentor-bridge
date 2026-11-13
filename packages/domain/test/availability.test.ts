import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isDiscoverable,
  isKnownTimeZone,
  MAX_AVAILABILITY_WINDOWS_PER_CONTEXT,
  overlaps,
  sortWindows,
  validateAvailabilityWindows,
  weekAnchor,
  zonedWindowToUtc,
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

test("a window is converted on the ISO week of the reference date", () => {
  // 2026-11-13 is a Friday; that week's Monday is 2026-11-09.
  const reference = new Date("2026-11-13T10:00:00.000Z");

  // Dhaka is UTC+6 all year: Monday 20:00-21:00 is 14:00-15:00 UTC.
  const dhaka = zonedWindowToUtc(
    { weekday: 1, startMinute: 1200, endMinute: 1260, timezone: "Asia/Dhaka" },
    reference,
  );
  assert.equal(dhaka.start.toISOString(), "2026-11-09T14:00:00.000Z");
  assert.equal(dhaka.end.toISOString(), "2026-11-09T15:00:00.000Z");

  // London in November is UTC+0: the same wall clock stays 20:00-21:00 UTC.
  const london = zonedWindowToUtc(
    { weekday: 1, startMinute: 1200, endMinute: 1260, timezone: "Europe/London" },
    reference,
  );
  assert.equal(london.start.toISOString(), "2026-11-09T20:00:00.000Z");
  assert.equal(london.end.toISOString(), "2026-11-09T21:00:00.000Z");

  assert.ok(!overlaps(dhaka, london), "six hours apart never overlaps");
});

test("the same wall clock in a summer week uses the summer offset", () => {
  const reference = new Date("2026-07-01T00:00:00.000Z");
  const london = zonedWindowToUtc(
    { weekday: 1, startMinute: 1200, endMinute: 1260, timezone: "Europe/London" },
    reference,
  );
  assert.equal(london.start.toISOString(), "2026-06-29T19:00:00.000Z");
  assert.equal(london.end.toISOString(), "2026-06-29T20:00:00.000Z");
});

test("a window may straddle UTC midnight and is still one interval", () => {
  const reference = new Date("2026-11-13T10:00:00.000Z");
  const early = zonedWindowToUtc(
    { weekday: 1, startMinute: 300, endMinute: 390, timezone: "Asia/Dhaka" },
    reference,
  );
  assert.equal(early.start.toISOString(), "2026-11-08T23:00:00.000Z");
  assert.equal(early.end.toISOString(), "2026-11-09T00:30:00.000Z");
  assert.ok(early.start.getUTCDate() !== early.end.getUTCDate(), "the interval crosses a UTC day");
});

test("a daylight-saving transition inside the week keeps real elapsed time", () => {
  // The EU transition is 2026-03-29 (Sunday): 01:30 GMT to 03:30 BST is one hour.
  const reference = new Date("2026-03-25T00:00:00.000Z");
  const crossed = zonedWindowToUtc(
    { weekday: 7, startMinute: 90, endMinute: 210, timezone: "Europe/London" },
    reference,
  );
  assert.equal(crossed.start.toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(crossed.end.toISOString(), "2026-03-29T02:30:00.000Z");

  // A week later the same wall clock is two hours wide.
  const later = zonedWindowToUtc(
    { weekday: 7, startMinute: 90, endMinute: 210, timezone: "Europe/London" },
    new Date("2026-04-01T00:00:00.000Z"),
  );
  assert.equal(later.start.toISOString(), "2026-04-05T00:30:00.000Z");
  assert.equal(later.end.toISOString(), "2026-04-05T02:30:00.000Z");
});

test("overlap is half-open and a half-hour zone converts exactly", () => {
  const reference = new Date("2026-11-13T10:00:00.000Z");
  const kolkata = zonedWindowToUtc(
    { weekday: 3, startMinute: 540, endMinute: 600, timezone: "Asia/Kolkata" },
    reference,
  );
  assert.equal(kolkata.start.toISOString(), "2026-11-11T03:30:00.000Z");
  assert.equal(kolkata.end.toISOString(), "2026-11-11T04:30:00.000Z");

  const touching = { start: kolkata.end, end: new Date(kolkata.end.getTime() + 3_600_000) };
  assert.ok(!overlaps(kolkata, touching), "touching intervals do not overlap");
  const inside = {
    start: new Date(kolkata.start.getTime() + 60_000),
    end: new Date(kolkata.end.getTime() - 60_000),
  };
  assert.ok(overlaps(kolkata, inside), "containment is overlap");
});

test("an unknown zone is refused and a real one is accepted", () => {
  assert.equal(isKnownTimeZone("Asia/Dhaka"), true);
  assert.equal(isKnownTimeZone("Mars/Olympus"), false);
  assert.equal(isKnownTimeZone(""), false);
});

test("the week anchor is the Monday of the reference week", () => {
  assert.equal(weekAnchor(new Date("2026-11-13T23:59:00.000Z")).toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(weekAnchor(new Date("2026-11-09T00:00:00.000Z")).toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(weekAnchor(new Date("2026-11-15T12:00:00.000Z")).toISOString(), "2026-11-09T00:00:00.000Z");
});
