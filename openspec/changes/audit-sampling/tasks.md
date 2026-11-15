# Tasks: audit-sampling

## 0. Preconditions

- [ ] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1`, `git status --short`, `grep -n "hold" services/api/src/outcomes/outcome.service.ts`, `grep -n "CASE_OPENED" -r services/api/src/outcomes`, `grep -n "OUTCOME_AUDIT_HELD" services/api/src/audit/audit.service.ts`. Record every mismatch before writing code.
- [ ] 0.2 Confirm `countDueOutcomes` selects only `CONFIRMED` rows with an expired cooling period: read `services/api/src/reputation/counting-job.ts` and paste the `where` clause here. If a held row could still be counted, stop and re-open the design.
- [ ] 0.3 Confirm `CASE_OPENED` has exactly one writer today: `grep -rn '"CASE_OPENED"' services/api/src | grep -v test`. If another writer exists, the derived `AUDIT_HOLD` branch is wrong; stop and record it.
- [ ] 0.4 Read `services/api/test/support/api-stack.ts` and record how an existing job test drives a queue handler without booting pg-boss.

## 1. Constants and the pure rule

- [ ] 1.1 `packages/config/src/index.ts`: add `AUDIT_SAMPLE_RATE = 0.25`, `AUDIT_ALWAYS_SAMPLED_OUTCOME_TYPES = ["ADMISSION", "INTERNSHIP", "JOB_OFFER"] as const`, `AUDIT_SAMPLE_SALT = "audit-sample-v1"`, and the one-line seam `auditSampleRate(): number`. Verify: `pnpm --filter @connect/config typecheck` and that `pnpm --filter @connect/config test` (if it has tests) still passes.
- [ ] 1.2 `packages/domain/src/audit-sample.ts`: `shouldSample({ outcomeId, outcomeType }): "ALWAYS" | "SAMPLED" | "SKIPPED"` using FNV-1a over `AUDIT_SAMPLE_SALT + ":" + outcomeId`, scaled by `2^32` and compared to `AUDIT_SAMPLE_RATE`. No import of any Node built-in: `packages/domain` stays dependency-free. Export it from `packages/domain/src/index.ts`. Verify: `pnpm --filter @connect/domain typecheck` and `pnpm lint` (the ESLint boundary rule must not complain).
- [ ] 1.3 Unit tests in `packages/domain/test/audit-sample.test.ts`: the same id always gives the same answer; ids spread across both sides of a 0.25 rate (assert a count over 1000 synthetic ids lands inside a stated band, and state the band in the test); an `ADMISSION`, an `INTERNSHIP` and a `JOB_OFFER` return `ALWAYS` regardless of the id; a `SKILL_MILESTONE` can return either. Verify: `pnpm --filter @connect/domain test`.
- [ ] 1.4 Mutation checks, recorded here: (a) return `SAMPLED` unconditionally and confirm the band assertion fails; (b) drop the salt and confirm nothing changes for one id but the distribution test still passes — then state that the salt's purpose is stability across a rate change, not distribution; (c) make `ALWAYS` ignore the type list and confirm 1.3 fails. Restore.

## 2. The hold accepts a system actor

- [ ] 2.1 Widen `HoldOutcomeInput.actorUserId` to `string | null` in `services/api/src/outcomes/outcome.service.ts` and its implementation, and pass `actorRole: "SYSTEM"` for the null case in the `appendAuditEntry` call, in the pattern of `drizzle-reports.service.ts:370`. Verify: `pnpm --filter api typecheck` and that the existing hold tests still pass.
- [ ] 2.2 Add one integration test to `services/api/test/outcomes.integration.test.ts`: a hold with a null actor writes one `OUTCOME_AUDIT_HELD` row whose `actor_role` is `SYSTEM` and whose `actor_user_id` is null, and the `CASE_OPENED` payload carries the reason.

## 3. The sampler job

- [ ] 3.1 `services/api/src/outcomes/audit-sampler.ts`: export `AUDIT_SAMPLE_QUEUE = "audit-sampler"`, `AUDIT_SAMPLE_CRON = "*/15 * * * *"`, `AUDIT_SAMPLE_BATCH = 50`, and `sampleConfirmedOutcomes(db, deps)` implementing design R3: bounded select of `CONFIRMED` with `cooling_ends_at > now()`, `shouldSample` per row, `hold` per selected row, `409` caught and skipped, other errors propagated. Verify: `pnpm --filter api typecheck`.
- [ ] 3.2 Register the queue in `services/api/src/platform/outbox/outbox-worker.ts`: `createQueue`, `schedule` and `work` in the same shape as `REPUTATION_COUNT_QUEUE`. Verify: `pnpm --filter api typecheck` and `grep -n "AUDIT_SAMPLE_QUEUE" services/api/src/platform/outbox/outbox-worker.ts` shows three uses.
- [ ] 3.3 Integration tests in `services/api/test/outcomes.integration.test.ts` (or a new `audit-sampling.integration.test.ts` if that file would grow past readability):
  - an `ADMISSION` in `CONFIRMED` with an unexpired cooling period is held on one run, with one event and one audit row, and no reputation row;
  - an outcome whose cooling period has ended is not touched;
  - a second run over the same rows writes nothing new and changes no status;
  - a `COUNTED` outcome is never selected;
  - an outcome confirmed by another actor between select and hold produces a `409` that the job swallows and the batch continues with the next row.
- [ ] 3.4 Mutation checks, recorded here: (a) remove the `cooling_ends_at > now()` predicate and confirm the "cooled outcome is not touched" test fails; (b) remove the `CONFIRMED` predicate and confirm the `COUNTED` test fails; (c) make the draw depend on `Math.random()` and confirm the determinism test fails. Restore all three.

## 4. The queue filter

- [ ] 4.1 `drizzle-outcome.service.ts`: extend the derived case kind with the `AUDIT_HOLD` branch from design R5, and add `caseKind?: CaseKind` to `ReviewQueueInput` with the comparison applied to the same expression. Verify: `pnpm --filter api typecheck`.
- [ ] 4.2 `review-queue.controller.ts`: read `@Query("case_kind")`, accept `disputed | conflict_declared | escalated_d7 | audit_hold` in any case, refuse anything else with `422` naming the parameter, and pass it through. Verify: `pnpm --filter api typecheck`.
- [ ] 4.3 Integration tests in `services/api/test/outcomes.integration.test.ts`: a held case reports `audit_hold` and not `escalated_d7`; a dispute still reports `disputed`; a declared conflict still reports `conflict_declared`; a day-7 escalation still reports `escalated_d7`; the filter returns only its kind; an unknown kind is `422`; a non-admin caller is `403 ROLE_REQUIRED`.
- [ ] 4.4 Mutation check: remove the `AUDIT_HOLD` branch and confirm the held-case kind test fails. Restore.

## 5. Registry and contract

- [ ] 5.1 `packages/contracts/openapi.yaml`: add the `case_kind` query parameter (enum of the four snake_case values) to `GET /v1/review-queue` and `audit_hold` to the response's `case_kind` enum. No path is added, so `MATRIX` and `ROUTE_BODY_KEYS` are unchanged — assert that with `git diff --stat` on those two files if the change touches them unexpectedly.
- [ ] 5.2 Confirm the parity tests pass untouched: `pnpm --filter @connect/contracts test` and `pnpm --filter api test` (the inventory test must not report a missing or a stale matrix row).
- [ ] 5.3 Add a test that `GET /v1/admin/audit?action=OUTCOME_AUDIT_HELD` answers `200` with the row, proving the action the sampler triggers is filterable without a new name. Verify: it fails when the action is removed from `AUDIT_ACTION_MAP`.

## 6. Docs gate

- [ ] 6.1 `docs/functional-requirements.md` `FR-ADM-03`: record what is now built (random sampling at the configured rate, the always-sampled types, the hold) and what is not (the anomaly clause), and set the status to `PARTIAL` with the gap named in one line — the row is not `DONE` while its third clause is undecided. Recount §2.16 from the rows by command and publish the new total with the date.
- [ ] 6.2 `docs/known-debt.md`: narrow `DEBT-29` to the anomaly clause and open one row for the anomaly trigger with the decision it needs; state the sampling rate and the always-sampled set as the working values in that row.
- [ ] 6.3 `docs/api-contracts.md` §5.9: the `case_kind` filter, the four values, the `422` on an unknown value, and the `audit_hold` kind.
- [ ] 6.4 `docs/decision-log.md`: one `D-xx` row for the rate, one for the always-sampled set, one for "no new audit action", one for the deterministic draw's salt.
- [ ] 6.5 Audit findings **C1** and **C2**: `README.md` status line and the `functional-requirements.md` §2.16 `FR-ADM-03` bullet. Fix them if this change lands first; otherwise verify they are already correct and leave them. Do not restate them in both proposals' commits.
- [ ] 6.6 `docs/mvp-build-plan.md` §5 row, `docs/milestones-and-phases.md` "Current state", and `.hermes.md` §10 if the `docs/audit/` line is still stale.
- [ ] 6.7 `docs/reputation-and-verification-policy.md`: one sentence stating that a confirmed outcome may be held for audit before it counts, with the rate as a configured value — the policy document is where an auditor looks first.

## 7. Verification gate

- [ ] 7.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, real totals pasted here, skipped count 0.
- [ ] 7.2 `openspec validate audit-sampling --strict` passes.
- [ ] 7.3 `git status`, `git diff --staged` reviewed; no migration exists in the diff — if one appears, the design was violated and the change stops.
- [ ] 7.4 Manual run against the local stack: run the sampler's exported function once through the worker's handler path (or wait one 15-minute tick) against the dev seed, and record before/after `outcomes.status` counts and the `OUTCOME_AUDIT_HELD` row count.
- [ ] 7.5 Stop. Not archived until the owner says so.
