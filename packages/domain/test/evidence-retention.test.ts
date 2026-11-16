import assert from "node:assert/strict";
import { test } from "node:test";

import { evidenceRetentionDue } from "../src/evidence-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-16T12:00:00.000Z");
const daysAgo = (days: number): Date => new Date(now.getTime() - days * DAY_MS);

const counted = (instant: Date | null, windowDays = 90) => ({
  outcomeStatus: "COUNTED",
  countedAt: instant,
  rejectedAt: null,
  now,
  windowDays,
});

test("the window is measured from the terminal instant, inclusive at the boundary", () => {
  assert.equal(evidenceRetentionDue(counted(daysAgo(89))), false, "one day early is not due");
  assert.equal(evidenceRetentionDue(counted(daysAgo(90))), true, "exactly at the boundary is due");
  assert.equal(evidenceRetentionDue(counted(daysAgo(91))), true, "a day late is due");
});

test("a rejected outcome counts from rejected_at and never from counted_at", () => {
  assert.equal(
    evidenceRetentionDue({
      outcomeStatus: "REJECTED",
      countedAt: daysAgo(400),
      rejectedAt: daysAgo(10),
      now,
      windowDays: 90,
    }),
    false,
    "counted_at is not this row's clock",
  );
  assert.equal(
    evidenceRetentionDue({
      outcomeStatus: "REJECTED",
      countedAt: null,
      rejectedAt: daysAgo(91),
      now,
      windowDays: 90,
    }),
    true,
  );
});

test("every other outcome state keeps its file, however old", () => {
  for (const outcomeStatus of [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "IN_PLATFORM_REVIEW",
    "WITHDRAWN",
    "REVERSED",
  ]) {
    assert.equal(
      evidenceRetentionDue({
        outcomeStatus,
        countedAt: daysAgo(400),
        rejectedAt: daysAgo(400),
        now,
        windowDays: 90,
      }),
      false,
      `${outcomeStatus} must never be due`,
    );
  }
});

test("a terminal state with no instant is never due", () => {
  assert.equal(evidenceRetentionDue(counted(null)), false);
  assert.equal(
    evidenceRetentionDue({
      outcomeStatus: "REJECTED",
      countedAt: null,
      rejectedAt: null,
      now,
      windowDays: 90,
    }),
    false,
  );
});
