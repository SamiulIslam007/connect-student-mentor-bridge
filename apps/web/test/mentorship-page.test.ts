import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agreementState,
  cadenceLabel,
  canCompleteMentorship,
  canConfirmSession,
  composeMessage,
  MESSAGE_MAX_LENGTH,
  mentorshipStatusLabel,
  pageState,
  pageStateMessage,
  sessionStatusLabel,
} from "../lib/mentorship-view.js";
import { strings } from "../lib/strings.js";

test("the page shows loading until the read settles, then ready, error or not-found", () => {
  assert.equal(pageState({ signedOut: false, notFound: false, failed: false, loaded: false }), "loading");
  assert.equal(pageState({ signedOut: false, notFound: false, failed: false, loaded: true }), "ready");
  assert.equal(pageState({ signedOut: false, notFound: false, failed: true, loaded: true }), "error");
  assert.equal(pageState({ signedOut: false, notFound: true, failed: false, loaded: true }), "not-found");
  assert.equal(pageState({ signedOut: true, notFound: false, failed: false, loaded: true }), "signed-out");
});

test("every page state carries a string-catalog message", () => {
  const seen = new Set<string>();
  for (const state of ["loading", "signed-out", "not-found", "error"] as const) {
    const message = pageStateMessage(state);
    assert.ok(message);
    assert.ok(
      (Object.values(strings.mentorship) as string[]).includes(message),
      `${state} must come from the catalog`,
    );
    seen.add(message);
  }
  assert.equal(seen.size, 4);
  assert.equal(pageStateMessage("ready"), null);
});

test("an empty or over-length message is refused before the request", () => {
  assert.deepEqual(composeMessage("   "), {
    ok: false,
    message: strings.mentorship.messageRequired,
  });
  assert.deepEqual(composeMessage("x".repeat(MESSAGE_MAX_LENGTH + 1)), {
    ok: false,
    message: strings.mentorship.messageTooLong,
  });
  assert.deepEqual(composeMessage("  Hello mentor  "), { ok: true, body: "Hello mentor" });
});

test("statuses and cadences are labelled from the catalog", () => {
  assert.equal(mentorshipStatusLabel("active"), strings.mentorship.statusActive);
  assert.equal(mentorshipStatusLabel("completed"), strings.mentorship.statusCompleted);
  assert.equal(mentorshipStatusLabel("ended_early"), strings.mentorship.statusEndedEarly);
  assert.equal(cadenceLabel("weekly"), strings.mentorship.cadenceWeekly);
  assert.equal(cadenceLabel(null), strings.mentorship.cadenceNotSet);
  assert.equal(sessionStatusLabel("held"), strings.mentorship.sessionHeld);
  assert.equal(sessionStatusLabel("cancelled"), strings.mentorship.sessionCancelled);
});

test("the agreement state names both parties' acknowledgements", () => {
  assert.equal(agreementState(null, null, true), null);
  assert.equal(
    agreementState("2026-01-01T00:00:00Z", null, true),
    strings.mentorship.acknowledgedByYou,
  );
  assert.equal(agreementState("2026-01-01T00:00:00Z", null, false), null);
  assert.equal(
    agreementState("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", false),
    strings.mentorship.acknowledgedBoth,
  );
});

test("only a scheduled session and an active mentorship offer their action", () => {
  assert.equal(canConfirmSession("scheduled"), true);
  assert.equal(canConfirmSession("held"), false);
  assert.equal(canConfirmSession("cancelled"), false);
  assert.equal(canCompleteMentorship("active"), true);
  assert.equal(canCompleteMentorship("completed"), false);
});
