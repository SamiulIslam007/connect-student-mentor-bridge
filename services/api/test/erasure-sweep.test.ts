import assert from "node:assert/strict";
import { test } from "node:test";

import {
  erasureSweepRecord,
  parseErasureSweepArgs,
} from "../src/privacy/erasure-sweep.js";

/**
 * SEC-AUDIT-009 (D-259): the irreversible sweep runs dry unless an operator
 * confirms a backup date, and the record names that date and the candidate count.
 */

test("no flag means a dry run", () => {
  assert.deepEqual(parseErasureSweepArgs([]), { dryRun: true, backupAt: null });
  assert.deepEqual(parseErasureSweepArgs(["--verbose"]), { dryRun: true, backupAt: null });
});

test("a confirmed backup date enables the real run", () => {
  assert.deepEqual(parseErasureSweepArgs(["--confirm-backup=2026-11-22"]), {
    dryRun: false,
    backupAt: "2026-11-22",
  });
});

test("a malformed backup value is refused before any database work", () => {
  for (const value of ["", "yesterday", "2026-11-22T00:00:00Z", "22-11-2026"]) {
    assert.throws(
      () => parseErasureSweepArgs([`--confirm-backup=${value}`]),
      /YYYY-MM-DD/,
      value,
    );
  }
});

test("the operator record names the backup, the mode and the counts", () => {
  const record = erasureSweepRecord({ dryRun: false, backupAt: "2026-11-22" }, {
    eligible: 3,
    deleted: 2,
    failed: 1,
  });

  assert.equal(record.event, "privacy.erasure_sweep");
  assert.equal(record.dry_run, false);
  assert.equal(record.backup_at, "2026-11-22");
  assert.equal(record.candidates, 3);
  assert.equal(record.deleted, 2);
  assert.equal(record.failed, 1);
  assert.equal(record.window_days, 90);
});

test("a dry-run record still reports the candidate count", () => {
  const record = erasureSweepRecord({ dryRun: true, backupAt: null }, {
    eligible: 5,
    deleted: 0,
    failed: 0,
  });
  assert.equal(record.dry_run, true);
  assert.equal(record.backup_at, null);
  assert.equal(record.candidates, 5);
});
