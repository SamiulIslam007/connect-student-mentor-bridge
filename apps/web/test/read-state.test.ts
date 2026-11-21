import assert from "node:assert/strict";
import { test } from "node:test";

import { REFRESH_WINDOW_MS, newSince, shouldMarkRead, unreadBadge } from "../lib/read-state";

const messages = [
  { id: "m1", created_at: "2026-11-21T10:00:00.000Z" },
  { id: "m2", created_at: "2026-11-21T11:00:00.000Z" },
  { id: "m3", created_at: "2026-11-21T12:00:00.000Z" },
];

test("a badge appears only for a positive count", () => {
  assert.equal(unreadBadge(undefined), null);
  assert.equal(unreadBadge(0), null);
  assert.equal(unreadBadge(-2), null);
  assert.deepEqual(unreadBadge(1), { count: 1 });
  assert.deepEqual(unreadBadge(7), { count: 7 });
});

test("the divider sits before the first message written after the marker", () => {
  assert.equal(newSince("2026-11-21T10:00:00.000Z", messages), "m2");
  assert.equal(newSince("2026-11-21T10:30:00.000Z", messages), "m2");
  assert.equal(newSince("2026-11-21T11:00:00.000Z", messages), "m3");
  assert.equal(newSince("2026-11-21T12:00:00.000Z", messages), null);
  assert.equal(newSince("2026-11-21T13:00:00.000Z", messages), null);
  assert.equal(newSince(null, messages), "m1");
  assert.equal(newSince("not a date", messages), "m1");
  assert.equal(newSince("2026-11-21T10:00:00.000Z", []), null);
});

test("the marker is written on the first load and then once per window", () => {
  const now = 1_000_000;
  assert.equal(shouldMarkRead(null, now), true);
  assert.equal(shouldMarkRead(now, now + 1_000), false);
  assert.equal(shouldMarkRead(now, now + REFRESH_WINDOW_MS - 1), false);
  assert.equal(shouldMarkRead(now, now + REFRESH_WINDOW_MS), true);
  assert.equal(shouldMarkRead(now, now + REFRESH_WINDOW_MS * 3, 90_000), true);
});
