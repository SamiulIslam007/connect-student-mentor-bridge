import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accessStateLabel,
  canRequest,
  directoryQuery,
  mergeCards,
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
