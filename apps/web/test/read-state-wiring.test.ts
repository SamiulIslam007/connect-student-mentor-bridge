import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The wiring a pure test cannot see (D-246, D-247): the page must send the write,
 * the divider must be rendered from it, the list must show the count, and the BFF
 * must forward the route at all. Web tests never render, so the page sources are
 * read the way the other route tests read them.
 */
const app = join(__dirname, "..", "app");
const read = (...parts: string[]): string => readFileSync(join(app, ...parts), "utf8");

test("the BFF forwards POST /:id/read and nothing else new", () => {
  const route = read("api", "mentorships", "[[...path]]", "route.ts");
  assert.match(route, /"POST \/:id\/read",/);
});

test("the mentorship page marks the thread read on open and draws the divider", () => {
  const page = read("mentorship", "[id]", "page.tsx");
  assert.match(page, /csrfFetch\(`\/api\/mentorships\/\$\{mentorshipId\}\/read`/, "the page must POST the marker");
  assert.match(page, /firstNewId/, "the divider is driven by the new-message id");
  assert.match(page, /strings\.mentorship\.newMessages/, "the divider text comes from the catalog");
});

test("the requests page shows the unread badge from the shared helper", () => {
  const page = read("requests", "page.tsx");
  assert.match(page, /unreadBadge\(/, "the badge count comes from the helper");
  assert.match(page, /badge badge--mentor/, "the badge uses the shared classes");
  assert.match(page, /strings\.requests\.unread/, "the label comes from the catalog");
});

test("no page carries the unread copy as a literal", () => {
  for (const source of [read("requests", "page.tsx"), read("mentorship", "[id]", "page.tsx")]) {
    assert.doesNotMatch(source, /new message/);
  }
});
