import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { accessStateLabel } from "../lib/mentor-directory.js";
import { SUGGESTION_KEYS, mergeSuggestions, readSuggestions, reasonLabels } from "../lib/suggestions.js";
import { strings } from "../lib/strings.js";

function entry(id: string, reasons: string[] = ["Shares your field: Databases."]) {
  return {
    id,
    display_name: `Mentor ${id}`,
    headline: "Backend engineer",
    access_state: "available",
    access_mode: "OPEN",
    primary_field: { id: "f-1", name: "Software engineering" },
    fields: [],
    languages: ["en"],
    reasons,
    limited_information: false,
  };
}

test("a suggestion keeps the directory card shape plus reasons and limited_information", () => {
  const [suggestion] = readSuggestions({ data: [entry("m-1")] });
  assert.ok(suggestion);
  assert.deepEqual(Object.keys(suggestion).sort(), [...SUGGESTION_KEYS].sort());
  // The card helpers read the same keys, so one markup serves both surfaces.
  assert.equal(suggestion.display_name, "Mentor m-1");
  assert.equal(accessStateLabel(suggestion.access_state), strings.mentors.stateAvailable);
  assert.equal(reasonLabels(suggestion).length, 1);
});

test("an empty or malformed payload reads as an empty set", () => {
  assert.deepEqual(readSuggestions(null), []);
  assert.deepEqual(readSuggestions({}), []);
  assert.deepEqual(readSuggestions({ data: [] }), []);
  assert.deepEqual(readSuggestions({ data: [{ id: 1 }] }), []);
});

test("the set never exceeds five and reasons never exceed three", () => {
  const many = readSuggestions({
    data: Array.from({ length: 8 }, (_, index) => entry(`m-${index}`)),
  });
  assert.equal(many.length, 5);

  const limited = reasonLabels(entry("m-1", ["a", "b", "c", "d"]));
  assert.deepEqual(limited, ["a", "b", "c"]);
  assert.deepEqual(reasonLabels(entry("m-1", ["a", "", "  "])), ["a"]);
});

test("merging suggestions never touches the directory page", () => {
  const merged = mergeSuggestions([entry("m-1")], [entry("m-1"), entry("m-2")]);
  assert.deepEqual(
    merged.map((suggestion) => suggestion.id),
    ["m-1", "m-2"],
  );
  assert.ok(SUGGESTION_KEYS.includes("limited_information"));
});

test("the mentors page renders the suggested section above the list", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../app/mentors/page.tsx", import.meta.url)),
    "utf8",
  );
  const intro = source.indexOf("strings.mentors.suggestedTitle");
  const list = source.indexOf("cards.map");
  assert.ok(intro >= 0, "the page names the suggested section");
  assert.ok(list > intro, "the suggested section comes before the directory list");
  assert.ok(source.includes("strings.mentors.suggestedEmpty"), "the empty state is a catalog line");
  assert.ok(source.includes("/api/suggestions"), "the page reads the suggestion route");
  assert.ok(
    source.includes("/request/new?mentor="),
    "a suggestion reuses the existing request link",
  );
});
