import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAGE_STATES,
  beginLoad,
  beginSubmit,
  settleFailure,
  settleSuccess,
  stateKey,
  type PageSurface,
} from "../lib/page-state.js";
import { strings } from "../lib/strings.js";

const SURFACES: PageSurface[] = [
  "sessions",
  "security",
  "profile",
  "requestNew",
  "signIn",
  "signUp",
  "mfa",
  "forgotPassword",
  "reset",
  "verify",
];

test("the state set is exactly the five names the pages render", () => {
  assert.deepEqual([...PAGE_STATES], ["idle", "loading", "error", "empty", "ready"]);
});

test("a load moves idle to loading, and a read with no items settles to empty", () => {
  assert.deepEqual(beginLoad(), { state: "loading", message: null });
  assert.deepEqual(settleSuccess(true), { state: "empty", message: null });
  assert.deepEqual(settleSuccess(), { state: "ready", message: null });
});

test("a submit moves to loading and a failure carries the server's own message", () => {
  assert.deepEqual(beginSubmit(), { state: "loading", message: null });
  assert.deepEqual(settleFailure("That email is already registered."), {
    state: "error",
    message: "That email is already registered.",
  });
  assert.deepEqual(settleFailure(null), { state: "error", message: null });
});

test("every surface has a line for each state it can reach", () => {
  for (const surface of SURFACES) {
    assert.ok(stateKey("loading", surface).length > 0, `${surface} needs a loading line`);
    assert.ok(stateKey("error", surface).length > 0, `${surface} needs an error line`);
    assert.equal(stateKey("idle", surface), "", `${surface} renders nothing while idle`);
    assert.equal(stateKey("ready", surface), "", `${surface} renders nothing when ready`);
  }
});

test("the lines come from the string catalogue, not from inline copies", () => {
  const catalogue = (Object.values(strings) as unknown[])
    .filter((group): group is Record<string, string> => typeof group === "object" && group !== null)
    .flatMap((group) => Object.values(group).filter((value) => typeof value === "string"));

  for (const surface of SURFACES) {
    for (const state of ["loading", "error"] as const) {
      assert.ok(
        catalogue.includes(stateKey(state, surface)),
        `${surface}.${state} must name a catalogue entry`,
      );
    }
  }
  assert.equal(stateKey("empty", "sessions"), strings.sessions.empty);
});

test("two surfaces never share a loading line, so a page cannot show another's copy", () => {
  const lines = SURFACES.map((surface) => stateKey("loading", surface));
  assert.equal(new Set(lines).size, lines.length);
});
