# Proposal: evidence-retention-edges

## Why

`FR-PRIV-03` is `DONE` but its edge cases are holes a privacy notice cannot afford: `DEBT-66` records that a `REVERSED` or `WITHDRAWN` outcome keeps its evidence file **forever**, and `DEBT-64` records that `docs/data-privacy-and-retention.md` §6's "faster if the user withdraws consent" has no code behind it. Today's predicate says so in its own comment — "`REVERSED` and `WITHDRAWN` keep their file (D-204)" — so the promise is narrower than the document.

## What Changes

- The retention trigger set becomes `COUNTED`, `REJECTED`, `REVERSED` and `WITHDRAWN`, each measured from **its own** transition instant (`counted_at`, `rejected_at`, `reversed_at`, `withdrawn_at`): a clawback never makes a file immediately due, because the clock restarts when it is decided.
- A withdrawal of `INSTITUTION_DATA_SHARING` consent starts the same clock at the withdrawal instant, when that instant is earlier than the outcome's own settle instant, so a student who withdraws does not wait out a window that began later.
- The row keeps its SHA-256, size and content type and one `EVIDENCE_RETENTION_DELETED` audit entry is written, exactly as it is today; the locked per-file transaction is reused unchanged.
- The same dry-run switch governs everything: `EVIDENCE_RETENTION_DRY_RUN` deletes nothing unless it is exactly `false`.
- No migration: `outcomes.reversed_at` and `outcomes.withdrawn_at` already exist (`services/api/src/db/schema/outcomes.ts:72-73`), and the consent instant is read from `consent_records`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trust/evidence-retention`: "An evidence file is deleted after its outcome settles" is restated with four triggers and its clock rule; two ADDED requirements carry the reversal-or-withdrawal clock and the consent-withdrawal clock.

## Impact

- **Code**: `packages/domain/src/evidence-retention.ts` (the trigger set, two more instants, the consent instant and the origin rule), `services/api/src/evidence/retention.ts` (the selection query and the per-row re-read carry the same instants), `packages/domain/src/index.ts` (no new export, one widened input).
- **Contract**: none. No route and no payload change.
- **Data**: none. No migration, no new column, no backfill; the table count stays 33.
- **Tests**: `packages/domain/test/evidence-retention.test.ts` (four triggers, four origins, the consent origin, the never-earlier-than boundary), `services/api/test/evidence.integration.test.ts` (a reversed and a withdrawn outcome lose their object past the window; a consent withdrawal brings a counted outcome due early; the dry run still deletes nothing). `truncateAll()` already truncates `consent_records`, so no test support changes.
- **Docs**: `docs/data-privacy-and-retention.md` §6, `docs/functional-requirements.md` (`FR-PRIV-03` text), `docs/known-debt.md` (close `DEBT-66` and `DEBT-64`), `docs/data-model.md` (the two instants become live, one line), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md` (one row superseding `D-204`).

## Depends on

`evidence-upload-and-scan` and `evidence-retention-sweeper` (both archived 2026-11-16): this change widens their predicate and query, and cannot land before them. It shares no file with the other changes of this round.

## Out of scope

- **Threads, requests, sessions, audit rows and exports.** Their retention periods are in the same section of the privacy document and none has a job; each is its own change.
- **Deleting an evidence row**, its hash or its size: the record survives the file, by the existing rule.
- **An immediate deletion on withdrawal.** The brief starts a clock, it does not bypass one; a student who wants the file gone now still asks through the privacy request path.
- **Re-deriving the scan status or the tier**: a deleted file's tier stays what the row says.
- **Withdrawal of any other consent purpose.** Only `INSTITUTION_DATA_SHARING` is a sharing consent; the other four are contractual and deleting evidence on them would be an invented rule.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A clawback deletes the material the reversal was decided on | The clock restarts at `reversed_at`, not `counted_at`, so the file survives the full window after the reversal; the domain test covers a reversal of an old count and asserts not-due |
| The SQL and the pure predicate disagree, so a row is selected that the predicate would refuse | The existing integration test pins the query to the predicate; this change adds one assertion per new trigger, and the per-row transaction re-reads and re-checks before deleting |
| A consent withdrawal reads the wrong user's consent (the mentor's, not the student's) | The join goes `outcome_evidence` to `outcomes.student_profile_id` to `student_profiles.user_id` to `consent_records.user_id`, and a fixture with two students proves only the reporter's withdrawal counts |
| Deleting a withdrawn outcome's file destroys a student's own proof | That is the decided policy and it is stated in the privacy document; the row keeps the hash and the audit entry, so the existence and integrity of what was reported remain provable |
| The change quietly turns deletion on | The dry-run default and its exact-value rule are untouched, and one test asserts the shipped default still deletes nothing |

**Rollback**: restore the two-name trigger set and drop the consent join; no data is lost by rolling back, and a file already deleted stays deleted (its row's `deleted_at` is the record). The migration-free shape makes the rollback a code revert only.

**Traces to** FR-PRIV-03, SEC-DATA-5, DEBT-64, DEBT-66, D-204, D-205, D-208, D-210.
