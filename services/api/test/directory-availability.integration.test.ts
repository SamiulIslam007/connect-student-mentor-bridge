import assert from "node:assert/strict";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { apiRequest, registerAndVerify, startApiStack, type TestApiStack } from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { AuthController } from "../src/identity/auth.controller.js";

/**
 * The availability filter (FR-DISC-01, D-143). Every window is seeded on the
 * current ISO week, and the viewer's request names Monday of that week, so the
 * assertions do not depend on which day the suite runs.
 */
const CONTROLLERS = [AuthController, ProfilesController];

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";
let fieldId: string | undefined;

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => [
      { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
    ],
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

beforeEach(async () => {
  if (stack) {
    await truncateAll(stack.client);
    fieldId = undefined;
  }
});

after(async () => {
  await stack?.close();
});

function requireStack(context: TestContext): TestApiStack | null {
  if (!stack) {
    context.skip(skipReason);
    return null;
  }
  return stack;
}

async function seedField(current: TestApiStack): Promise<string> {
  if (fieldId) {
    return fieldId;
  }
  const created = await current.client.query<{ id: string }>(
    "INSERT INTO fields (name, normalized_slug) VALUES ('Software engineering', 'software engineering') RETURNING id",
  );
  fieldId = created.rows[0].id;
  return fieldId;
}

interface Window {
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

/** One ACTIVE mentor with optional weekly windows. */
async function seedMentor(
  current: TestApiStack,
  email: string,
  windows: Window[] = [],
): Promise<string> {
  await registerAndVerify(current, email);
  const field = await seedField(current);
  const user = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const userId = user.rows[0].id;
  await current.client.query(
    `INSERT INTO mentor_profiles
       (user_id, primary_field_id, status, onboarding_status, headline, bio,
        expertise_summary, scope_statement, weekly_capacity, access_mode)
     VALUES ($1, $2, 'ACTIVE', 'AFFILIATION_VERIFIED', 'Headline', 'Bio', 'Expertise', 'Scope', 2, 'OPEN')`,
    [userId, field],
  );
  for (const window of windows) {
    await current.client.query(
      `INSERT INTO availability_windows (user_id, context, weekday, start_minute, end_minute, timezone)
       VALUES ($1, 'MENTOR', $2, $3, $4, $5)`,
      [userId, window.weekday, window.startMinute, window.endMinute, window.timezone],
    );
  }
  const profile = await current.client.query<{ id: string }>(
    "SELECT id FROM mentor_profiles WHERE user_id = $1",
    [userId],
  );
  return profile.rows[0].id;
}

/** Monday 20:00-21:00 in Dhaka: the request every positive case uses. */
const VIEWER_WEEKDAY = 1;
const VIEWER_START = 1200;
const VIEWER_END = 1260;

function viewerQuery(overrides: Record<string, string | number> = {}): string {
  const params = new URLSearchParams({
    available_weekday: String(VIEWER_WEEKDAY),
    available_start: String(VIEWER_START),
    available_end: String(VIEWER_END),
    available_timezone: "Asia/Dhaka",
  });
  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, String(value));
  }
  return params.toString();
}

/** The directory returns profile ids, which are the only unique label here. */
async function profileIds(current: TestApiStack, query: string): Promise<string[]> {
  const response = await apiRequest(current, "GET", `/v1/mentors?${query}`);
  assert.equal(response.status, 200, response.text);
  return (response.body?.data as { id: string }[]).map((card) => card.id);
}

test("without availability parameters the directory is unchanged", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await seedMentor(current, "covering@example.com");
  await seedMentor(current, "later@example.com");

  const all = await profileIds(current, "");
  assert.equal(all.length, 2, "no filter still lists every mentor");
});

test("a covering window matches, a later one does not, and one with no windows is excluded", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const covering = await seedMentor(current, "covering@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: 1140, endMinute: 1320, timezone: "Asia/Dhaka" },
  ]);
  await seedMentor(current, "later@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: 1320, endMinute: 1380, timezone: "Asia/Dhaka" },
  ]);
  await seedMentor(current, "no-windows@example.com");

  const matched = await profileIds(current, viewerQuery());
  assert.deepEqual(matched, [covering]);

  const unfiltered = await profileIds(current, "");
  assert.equal(unfiltered.length, 3, "the same mentor is present without the filter");
  assert.ok(unfiltered.includes(covering));
});

test("the comparison is in UTC: a same-wall-clock mentor in another zone does not match", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  // 20:00-21:00 London in November is 20:00-21:00 UTC, six hours after Dhaka's.
  await seedMentor(current, "london-wall-clock@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: VIEWER_START, endMinute: VIEWER_END, timezone: "Europe/London" },
  ]);
  // 14:00-15:00 London is the same UTC instant as 20:00-21:00 Dhaka.
  const overlap = await seedMentor(current, "london-overlap@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: 840, endMinute: 900, timezone: "Europe/London" },
  ]);

  const matched = await profileIds(current, viewerQuery());
  assert.deepEqual(matched, [overlap]);
});

test("a window that straddles UTC midnight matches the requested instant", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  // Monday 05:00-06:30 Dhaka is Sunday 23:00 to Monday 00:30 UTC.
  const early = await seedMentor(current, "early@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: 300, endMinute: 390, timezone: "Asia/Dhaka" },
  ]);

  // Monday 04:00-05:30 Dhaka is 22:00-23:30 UTC: it overlaps the window's start.
  const beforeMidnight = await profileIds(
    current,
    viewerQuery({ available_weekday: 1, available_start: 240, available_end: 330 }),
  );
  assert.deepEqual(beforeMidnight, [early], "the Sunday 23:00 UTC side matches");

  // Monday 06:00-07:00 Dhaka is 00:00-01:00 UTC: it overlaps the window's end.
  const afterMidnight = await profileIds(
    current,
    viewerQuery({ available_weekday: 1, available_start: 360, available_end: 420 }),
  );
  assert.deepEqual(afterMidnight, [early], "the Monday 00:00 UTC side matches");

  const nowhereNear = await profileIds(
    current,
    viewerQuery({ available_weekday: 1, available_start: 600, available_end: 660 }),
  );
  assert.deepEqual(nowhereNear, [], "a window that overlaps neither side does not match");
});

test("a malformed filter is a 422 naming its parameter, and a partial set is refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await seedMentor(current, "invalid@example.com", [
    { weekday: VIEWER_WEEKDAY, startMinute: 1140, endMinute: 1320, timezone: "Asia/Dhaka" },
  ]);

  const cases: [string, RegExp][] = [
    ["available_weekday=1", /sent together|available_/],
    ["available_weekday=1&available_start=600&available_end=660", /sent together/],
    ["available_timezone=Asia/Dhaka", /sent together/],
    [viewerQuery({ available_weekday: 8 }), /available_weekday/],
    [viewerQuery({ available_start: 1260, available_end: 1200 }), /available_end/],
    [viewerQuery({ available_end: 1441 }), /available_end/],
    [viewerQuery({ available_timezone: "Mars/Olympus" }), /available_timezone/],
  ];

  for (const [query, field] of cases) {
    const refused = await apiRequest(current, "GET", `/v1/mentors?${query}`);
    assert.equal(refused.status, 422, `${query}: ${refused.text}`);
    assert.match(String(refused.body?.detail ?? ""), field, `${query} names its parameter`);
  }
});
