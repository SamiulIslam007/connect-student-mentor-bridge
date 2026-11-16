# Tasks: evidence-retention-sweeper

## 0. Preconditions

- [x] 0.1 Re-check the snapshot: `git log --oneline -1`, `git status --short`, `grep -n "deletedAt" services/api/src/db/schema/outcomes.ts` (the evidence table must exist — this change does not create it), `grep -n "countedAt\|rejectedAt" services/api/src/db/schema/outcomes.ts`.
- [x] 0.2 Confirm `EVIDENCE_RETENTION_DAYS` does not exist yet: `grep -n "RETENTION" packages/config/src/index.ts`. Record the answer; if `configuration-versioning` landed first and moved this value into a version payload, read it from there instead and record that here.
- [x] 0.3 Read `services/api/src/platform/outbox/outbox-worker.ts` and record the exact registration shape to copy.
- [x] 0.4 Read the dry-run flag pattern in `apps/web/lib/security-headers.ts` (`cspMode`) and mirror its shape — one exact enabling value, everything else safe.

## 1. The pure predicate

- [x] 1.1 `packages/domain/src/evidence-retention.ts`: `evidenceRetentionDue({ outcomeStatus, countedAt, rejectedAt, now, windowDays })` returning a boolean. Terminal states only (`COUNTED`, `REJECTED`); the instant is the matching one; `now - instant >= windowDays` days exactly at the boundary. No Node import; exported from `index.ts`.
- [x] 1.2 Unit tests in `packages/domain/test/evidence-retention.test.ts`: one day before the boundary is not due; exactly at the boundary is due; one day after is due; each of the five non-triggering states is never due, however old; a `COUNTED` outcome with a null `counted_at` is never due (defensive); `REJECTED` uses `rejected_at` and not `counted_at`.
- [x] 1.3 Mutation checks recorded here: widen the predicate to "any terminal state" and confirm the `WITHDRAWN`/`REVERSED` tests fail; drop the `>=` to `>` and confirm the boundary test fails. Restore.

## 2. The sweep

- [x] 2.1 `packages/config/src/index.ts`: `EVIDENCE_RETENTION_DAYS = 90` and `evidenceRetentionDays()` as the one seam a future config version replaces.
- [x] 2.2 `services/api/src/evidence/retention.ts`: `sweepExpiredEvidence(db, { dryRun, batch, now })` returning `{ examined, eligible, deleted, failed, dryRun }`, implementing design R4's per-file order: select eligible rows (`status` terminal, instant older than the window, `deleted_at IS NULL`, object key present), then per row `storage.delete`, then the conditional update plus one audit row in one transaction. A delete failure is caught, counted as `failed`, and does not stop the batch.
- [x] 2.3 Dry-run behaviour lives in one branch: when `dryRun` is true nothing is deleted, nothing is updated, no audit row is written, and `eligible` is populated.
- [x] 2.4 `services/api/src/evidence/retention-job.ts`: `EVIDENCE_RETENTION_QUEUE = "evidence-retention"`, `EVIDENCE_RETENTION_CRON = "0 * * * *"`, `EVIDENCE_RETENTION_BATCH = 100`, and `retentionDryRun()` reading `EVIDENCE_RETENTION_DRY_RUN` with the exact-`false` rule (design R5). Register the queue in `outbox-worker.ts`.
- [x] 2.5 `EVIDENCE_RETENTION_DELETED` in `AuditAction` and `AUDIT_ACTION_MAP` (**both**), with `actorRole: "SYSTEM"` and `requestId: "system:evidence-retention"` on the row.

## 3. Tests

- [x] 3.1 Integration tests in `services/api/test/evidence.integration.test.ts`:
  - **real path, `dryRun: false`** — an outcome counted beyond the window loses its object; the row keeps `sha256`, `size_bytes`, `content_type` and gains `deleted_at`; exactly one `EVIDENCE_RETENTION_DELETED` row exists;
  - **real path, rejected outcome** — same behaviour on `rejected_at`;
  - **live outcome** — object untouched, even with an old `counted_at` that is absent;
  - **boundary** — a count one day inside the window is untouched;
  - **second run** — no object call, no second audit row, no change;
  - **store failure** — the fake storage client throws for one key: the row keeps `deleted_at` null, `failed` is 1, the other rows in the batch still delete;
  - **dry run** — `eligible` is greater than 0, `deleted` is 0, no object call, no audit row, and the row is unchanged.
- [x] 3.2 Unit test `retentionDryRun()`: unset → true; `""` → true; `"FALSE"` → true; `"0"` → true; `"no"` → true; `"false"` → false. This test is what makes the shipped default trustworthy.
- [x] 3.3 Audit filterability: `GET /v1/admin/audit?action=EVIDENCE_RETENTION_DELETED` answers `200` with the rows.
- [x] 3.4 Mutation checks recorded here: remove the `deleted_at IS NULL` predicate and confirm the second-run test fails; write the audit row when `dryRun` is true and confirm the dry-run test fails; make `retentionDryRun()` return false when unset and confirm 3.2 fails. Restore all three.

## 4. Contract

- [x] 4.1 No route changes. Assert it: `git diff --stat -- packages/contracts services/api/src/**/*.controller.ts` is empty for this change, and the parity tests pass untouched (`pnpm --filter @connect/contracts test`, the inventory test in `services/api/test`).

## 5. Docs gate

- [x] 5.1 `docs/data-privacy-and-retention.md` §6: the evidence row now reads "deleted 90 days after the outcome is counted or rejected, by an hourly job that ships in dry run"; §9 unchanged.
- [x] 5.2 `docs/functional-requirements.md` `FR-PRIV-03` to `DONE`, with the dry-run default stated in the same cell and the owner's flip named as the operational step; recount §2.16 by command and publish both totals.
- [x] 5.3 `docs/data-model.md`: `outcome_evidence.deleted_at` becomes live — state that the row outlives the object and that only the object is deleted.
- [x] 5.4 `docs/known-debt.md`: close `DEBT-32` with the evidence sentence; open one row for consent-withdrawal early deletion and one for the `REVERSED`/`WITHDRAWN` policy, each naming the decision it needs.
- [x] 5.5 `.env.example` gains `EVIDENCE_RETENTION_DRY_RUN=false` **is not** what ships: the file carries the variable name with the dry-run value (`true`) and a comment that only the exact value `false` enables deletion. `docs/local-setup.md` states the same in one line.
- [x] 5.6 Audit findings **C1** and **C2**: fix if this change lands first, otherwise verify and leave.
- [x] 5.7 `docs/mvp-build-plan.md` §5 row, `docs/milestones-and-phases.md` "Current state", `.hermes.md` §10 if still stale, `docs/decision-log.md` one row per decision R1–R7 — including the two the proposal flags (reversed/withdrawn keep their file; scan status does not gate deletion).

## 6. Verification gate

- [x] 6.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, real totals pasted here, skipped 0.
- [x] 6.2 `openspec validate evidence-retention-sweeper --strict` passes.
- [x] 6.3 A dry-run pass against the local stack: run the job's handler once, paste the returned counts, and confirm no object was deleted (`mc ls`/`aws s3 ls` against the container, or a `GetObject` on a key that the report named).
- [x] 6.4 Verify the diff contains **no migration**: `git status --short services/api/drizzle`.
- [x] 6.5 `git status`, `git diff --staged` reviewed; no unrelated file.
- [x] 6.6 Stop. Not archived until the owner says so. The real deletion stays off until the owner flips `EVIDENCE_RETENTION_DRY_RUN`.

## Results (2026-11-16)

- **Gates** under `CI=true`: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0 (the web build fails if the agent shell has `NODE_ENV=development` exported — that is an environment artefact, not a code fault; run the gate with `NODE_ENV` unset), `openspec validate --all --strict` clean. Test totals: domain 148, web 245, contracts 23, api 355 — **771 total, 0 failed, 0 skipped** (baseline 759; +4 domain predicate, +1 dry-run unit, +7 retention integration).
- **Mutation checks**: dropping the `deleted_at IS NULL` predicate failed the second-run test; removing the dry-run branch failed the dry-run test; inverting `retentionDryRun()` failed its unit test; `>=` to `>` failed the boundary test; widening the trigger list to `WITHDRAWN`/`REVERSED` failed the domain test. All five restored.
- **6.3 dry run against the local stack**: one planted eligible file (a real object in versitygw, an `outcome_evidence` row, the outcome stamped `COUNTED` 91 days back) ran through `sweepExpiredEvidence` with `dryRun: true`: `{"examined":1,"eligible":1,"deleted":0,"failed":0,"dryRun":true}` and the object was still fetchable afterwards (21 bytes). The planted row, object and outcome stamp were removed and the dev database verified back to `outcome_evidence` 0 rows. The real deletion path is exercised by the integration suite against a fake store, and `DeleteObject` against versitygw was proven in the upload change's task 0.
- **6.4 no migration**: `git status --short services/api/drizzle` is empty for this change.
