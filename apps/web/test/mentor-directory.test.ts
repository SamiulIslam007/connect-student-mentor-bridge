import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  accessStateLabel,
  availabilityActive,
  canRequest,
  directoryQuery,
  emptyAvailability,
  mergeCards,
  minuteOfDay,
  type MentorCard,
} from "../lib/mentor-directory.js";
import { strings } from "../lib/strings.js";

function card(id: string, accessState = "available"): MentorCard {
  return {
    id,
    display_name: `Mentor ${id}`,
    headline: "Headline",
    access_state: accessState,
    access_mode: "OPEN",
    primary_field: { id: "f-1", name: "Software engineering" },
    fields: [],
    languages: ["en"],
  };
}

test("the directory query carries only set filters", () => {
  assert.equal(directoryQuery({}), "");
  assert.equal(
    directoryQuery({ field: "f-1", accessState: "full", cursor: "m-1", limit: 10 }),
    "?field=f-1&access_state=full&cursor=m-1&limit=10",
  );
  assert.equal(directoryQuery({ field: "", accessState: "", cursor: null }), "");
});

test("a loaded page never repeats a card already on screen", () => {
  const merged = mergeCards([card("a"), card("b")], [card("b"), card("c")]);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["a", "b", "c"],
  );
});

test("access states are labelled from the catalog", () => {
  assert.equal(accessStateLabel("available"), strings.mentors.stateAvailable);
  assert.equal(accessStateLabel("application_only"), strings.mentors.stateApplicationOnly);
  assert.equal(accessStateLabel("full"), strings.mentors.stateFull);
  assert.equal(accessStateLabel("unknown"), "unknown");
});

test("only a full mentor refuses the request action", () => {
  assert.equal(canRequest("available"), true);
  assert.equal(canRequest("application_only"), true);
  assert.equal(canRequest("full"), false);
});

test("every directory card carries the verified-badge disclaimer", () => {
  const text = strings.disclaimer.verified;
  assert.match(text, /verified badge means the affiliation was checked/i);
  assert.match(text, /not independently audited by connect/i);

  // The card renders the catalog string; the badge rule is one sentence (D-83).
  const source = readFileSync(
    fileURLToPath(new URL("../app/mentors/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(source, /strings\.disclaimer\.verified/);
});

test("the availability parameters travel only when a day is chosen, and always all four", () => {
  const unset = emptyAvailability();
  assert.equal(directoryQuery({ availability: { ...unset, start: "20:00", end: "21:00", timezone: "Asia/Dhaka" } }), "");

  const filter = { weekday: "1", start: "20:00", end: "21:00", timezone: "Asia/Dhaka" };
  assert.equal(
    directoryQuery({ availability: filter }),
    "?available_weekday=1&available_start=1200&available_end=1260&available_timezone=Asia%2FDhaka",
  );

  // A half-filled window is forwarded so the API's own 422 explains it.
  assert.equal(
    directoryQuery({ availability: { ...filter, start: "", end: "" } }),
    "?available_weekday=1&available_start=&available_end=&available_timezone=Asia%2FDhaka",
  );

  // Clearing returns to the bare list.
  assert.equal(directoryQuery({ availability: emptyAvailability() }), "");
  assert.equal(availabilityActive(filter), true);
  assert.equal(availabilityActive(unset), false);
});

test("a time is minutes of day, and anything else is not a time", () => {
  assert.equal(minuteOfDay("00:00"), 0);
  assert.equal(minuteOfDay("20:30"), 1230);
  assert.equal(minuteOfDay("24:00"), null);
  assert.equal(minuteOfDay("9:00"), null);
  assert.equal(minuteOfDay(""), null);
});

test("the directory page offers the day, the window, the zone and a clear control", () => {
  const page = readFileSync(
    fileURLToPath(new URL("../app/mentors/page.tsx", import.meta.url)),
    "utf8",
  );
  for (const token of [
    'strings.mentors.availabilityWeekday',
    'strings.mentors.availabilityFrom',
    'strings.mentors.availabilityTo',
    'strings.mentors.availabilityTimeZone',
    'strings.mentors.availabilityClear',
    'type="time"',
    "WEEKDAY_OPTIONS",
    "browserTimeZone()",
    "strings.mentors.emptyFiltered",
    "availabilityActive(availability)",
  ]) {
    assert.ok(page.includes(token), `the page must contain ${token}`);
  }
});
