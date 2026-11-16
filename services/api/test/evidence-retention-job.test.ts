import assert from "node:assert/strict";
import { test } from "node:test";

import { retentionDryRun } from "../src/evidence/retention-job.js";

test("only the exact string false enables deletion", () => {
  const cases: [NodeJS.ProcessEnv, boolean][] = [
    [{}, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "" }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "FALSE" }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "False" }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "0" }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "no" }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: " true " }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: " false " }, true],
    [{ EVIDENCE_RETENTION_DRY_RUN: "false" }, false],
  ];
  for (const [env, expected] of cases) {
    assert.equal(retentionDryRun(env), expected, JSON.stringify(env));
  }
});
