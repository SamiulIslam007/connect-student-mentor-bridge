import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Route inventory for the mentor write policy (SEC-AUDIT-006, D-256). A new
 * mentor write must be added here and must carry the flag; the test fails when
 * one of the named methods loses it, and the review checklist names the list.
 */
const MENTOR_WRITES = [
  "setAgreement",
  "acknowledge",
  "postMessage",
  "createSession",
  "complete",
  "confirmHeld",
  "cancel",
  "accept",
  "decline",
  "confirm",
  "dispute",
] as const;

const FILES = [
  "mentorships/mentorships.controller.ts",
  "requests/requests.controller.ts",
  "outcomes/outcomes.controller.ts",
] as const;

test("every mentor write declares the second-factor requirement", () => {
  for (const file of FILES) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    for (const method of MENTOR_WRITES) {
      const start = source.indexOf(`async ${method}(`);
      if (start === -1) {
        continue;
      }
      const end = source.indexOf("\n  }", start);
      assert.ok(end > start, `${file} ${method} must be a complete method`);
      const block = source.slice(start, end);
      assert.match(
        block,
        /requiresMfa: true/,
        `${file} ${method} must declare requiresMfa: true`,
      );
    }
  }
});
