import assert from "node:assert/strict";
import { test } from "node:test";

import { evidenceRetentionDue, type EvidenceRetentionInput } from "../src/evidence-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-16T12:00:00.000Z");
const daysAgo = (days: number): Date => new Date(now.getTime() - days * DAY_MS);

function settled(overrides: Partial<EvidenceRetentionInput> = {}): EvidenceRetentionInput {
  return {
    outcomeStatus: "COUNTED",
    countedAt: null,
    rejectedAt: null,
    reversedAt: null,
    withdrawnAt: null,
    consentWithdrawnAt: null,
    now,
    windowDays: 90,
    ...overrides,
  };
}

test("the window is measured from the terminal instant, inclusive at the boundary", () => {
  assert.equal(evidenceRetentionDue(settled({ countedAt: daysAgo(89) })), false, "one day early");
  assert.equal(evidenceRetentionDue(settled({ countedAt: daysAgo(90) })), true, "exactly at the boundary");
  assert.equal(evidenceRetentionDue(settled({ countedAt: daysAgo(91) })), true, "a day late");
});

test("each of the four settled states reads its own instant", () => {
  const cases = [
    ["COUNTED", "countedAt"],
    ["REJECTED", "rejectedAt"],
    ["REVERSED", "reversedAt"],
    ["WITHDRAWN", "withdrawnAt"],
  ] as const;
  for (const [outcomeStatus, key] of cases) {
    assert.equal(evidenceRetentionDue(settled({ outcomeStatus, [key]: daysAgo(91) })), true, outcomeStatus);
    assert.equal(evidenceRetentionDue(settled({ outcomeStatus, [key]: daysAgo(10) })), false, outcomeStatus);
  }
});

test("a live state keeps its file, however old the row is", () => {
  for (const outcomeStatus of ["PENDING_CONFIRMATION", "CONFIRMED", "IN_PLATFORM_REVIEW"]) {
    assert.equal(
      evidenceRetentionDue(
        settled({
          outcomeStatus,
          countedAt: daysAgo(400),
          rejectedAt: daysAgo(400),
          reversedAt: daysAgo(400),
          withdrawnAt: daysAgo(400),
        }),
      ),
      false,
      `${outcomeStatus} must never be due`,
    );
  }
});

test("a reversal never inherits the older count's clock", () => {
  // Counted a year ago, reversed yesterday: the material the clawback was decided
  // on must survive the full window (the coalesce shape design R1 forbids).
  assert.equal(
    evidenceRetentionDue(
      settled({ outcomeStatus: "REVERSED", countedAt: daysAgo(365), reversedAt: daysAgo(1) }),
    ),
    false,
  );
  assert.equal(
    evidenceRetentionDue(
      settled({ outcomeStatus: "REVERSED", countedAt: daysAgo(365), reversedAt: daysAgo(91) }),
    ),
    true,
  );
});

test("a settled row whose own instant is null is never due", () => {
  const cases = [
    ["COUNTED", "countedAt"],
    ["REJECTED", "rejectedAt"],
    ["REVERSED", "reversedAt"],
    ["WITHDRAWN", "withdrawnAt"],
  ] as const;
  for (const [outcomeStatus] of cases) {
    // Every other instant is old; only this state's own instant is missing.
    assert.equal(
      evidenceRetentionDue(
        settled({
          outcomeStatus,
          countedAt: daysAgo(400),
          rejectedAt: daysAgo(400),
          reversedAt: daysAgo(400),
          withdrawnAt: daysAgo(400),
          ...(outcomeStatus === "COUNTED" ? { countedAt: null } : {}),
          ...(outcomeStatus === "REJECTED" ? { rejectedAt: null } : {}),
          ...(outcomeStatus === "REVERSED" ? { reversedAt: null } : {}),
          ...(outcomeStatus === "WITHDRAWN" ? { withdrawnAt: null } : {}),
          // A consent instant cannot resurrect a row with no own instant.
          consentWithdrawnAt: daysAgo(500),
        }),
      ),
      false,
      outcomeStatus,
    );
  }
});

test("an earlier consent withdrawal starts the clock sooner; a later one changes nothing", () => {
  const settledTenDaysAgo = settled({ countedAt: daysAgo(10) });
  assert.equal(
    evidenceRetentionDue({ ...settledTenDaysAgo, consentWithdrawnAt: daysAgo(95) }),
    true,
    "the withdrawal instant governs when it is earlier",
  );
  assert.equal(
    evidenceRetentionDue({ ...settledTenDaysAgo, consentWithdrawnAt: daysAgo(5) }),
    false,
    "a later withdrawal never advances the settle clock",
  );
  assert.equal(
    evidenceRetentionDue({ ...settledTenDaysAgo, consentWithdrawnAt: daysAgo(10) }),
    false,
    "an equal instant changes nothing",
  );
});

test("the consent instant also governs a reversal, and only when it is earlier", () => {
  const reversed = settled({ outcomeStatus: "REVERSED", reversedAt: daysAgo(2) });
  assert.equal(evidenceRetentionDue({ ...reversed, consentWithdrawnAt: daysAgo(100) }), true);
  assert.equal(evidenceRetentionDue({ ...reversed, consentWithdrawnAt: null }), false);
});
