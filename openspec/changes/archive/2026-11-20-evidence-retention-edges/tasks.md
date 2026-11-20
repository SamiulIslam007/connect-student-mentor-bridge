# Tasks: evidence-retention-edges

Decision rows to add at apply (reserved, one contiguous block): **D-230 to D-233** — D-230 four triggers with their own origins (superseding `D-204`), D-231 the consent instant can only advance the clock, D-232 the earliest withdrawal by the reporting student, D-233 no new column and no migration. Continue the block for any further `R` decision.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `cat packages/domain/src/evidence-retention.ts`, `sed -n '1,60p' services/api/src/evidence/retention.ts`.
- [x] 0.2 Confirm the four instants exist and no migration is needed: `grep -n "countedAt\|rejectedAt\|withdrawnAt\|reversedAt" services/api/src/db/schema/outcomes.ts`, `ls services/api/drizzle/*.sql | tail -1`.
- [x] 0.3 Confirm the consent columns and index: `sed -n '57,73p' services/api/src/db/schema/trust.ts`.
- [x] 0.4 Read `packages/domain/test/evidence-retention.test.ts` and list the assertions this change inverts, so they are rewritten and not silently dropped.
- [x] 0.5 Read the per-row transaction in `sweepExpiredEvidence` and record the exact place the pure predicate is re-checked.

## 1. The predicate

- [x] 1.1 `packages/domain/src/evidence-retention.ts`: the trigger list becomes the four states; the input gains `reversedAt`, `withdrawnAt` and `consentWithdrawnAt`; the origin is the state's own instant, then `min` with the consent instant when one exists; a null instant is never due. Update the doc comment so it no longer claims `D-204`'s rule.
- [x] 1.2 `packages/domain/test/evidence-retention.test.ts`: rewrite the two inverted assertions and add — reversal of a year-old count is not due; reversal past the window is due; withdrawal past the window is due; a null instant is never due; a consent instant earlier than the settle instant is due; a consent instant later changes nothing; the boundary is inclusive.
- [x] 1.3 Mutation checks recorded here: swap the origin to a coalesce across all four instants and confirm the year-old-count test fails; replace `min` with the consent instant and confirm the "later withdrawal changes nothing" test fails. Restore both.

## 2. The query and the sweep

- [x] 2.1 `services/api/src/evidence/retention.ts`: the selection statement filters on the four statuses, `deleted_at IS NULL`, an object key present, and the computed origin older than the window; the consent instant comes from one lateral subquery over `consent_records` joined through `outcomes.student_profile_id` to `student_profiles.user_id`, taking `min(occurred_at)` for `INSTITUTION_DATA_SHARING` and `WITHDRAWN`.
- [x] 2.2 The per-row transaction passes the same four instants and the consent instant to `evidenceRetentionDue` before deleting, so a row that moved between the batch read and the lock is skipped.
- [x] 2.3 Confirm the audit row, `deleted_at`, the metadata survivors and `EVIDENCE_RETENTION_DRY_RUN` are unchanged, and that no new environment variable was introduced.

## 3. Tests

- [x] 3.1 `services/api/test/evidence.integration.test.ts`: the ten acceptance criteria, with a fixture of two students, one mentor, one counted-and-reversed outcome and one withdrawn outcome.
- [x] 3.2 The dry run: with the new eligible rows present, `dryRun: true` reports a larger `eligible`, deletes nothing and writes no audit row.
- [x] 3.3 The second-run and storage-failure tests still pass unchanged (proving the locked transaction survived the widening).
- [x] 3.4 Mutation checks recorded here: drop the consent join and confirm the early-withdrawal test fails; use the mentor's consent instead of the student's and confirm that test fails. Restore both.

## 4. Docs

- [x] 4.1 `docs/data-privacy-and-retention.md` §6: the evidence row now says four settled states, the per-state clock, and that a consent withdrawal advances the clock; the "faster if the user withdraws consent" phrase becomes the implemented rule rather than a note.
- [x] 4.2 `docs/functional-requirements.md` `FR-PRIV-03`: the text names the four triggers and the consent withdrawal, and the row stays `DONE`; §2.16's figure does not move (verify, do not assume).
- [x] 4.3 `docs/known-debt.md`: close `DEBT-66` and `DEBT-64` with their evidence lines.
- [x] 4.4 `docs/data-model.md`: one line that `reversed_at` and `withdrawn_at` now start the retention clock, so a reader of the two columns knows why they are read.
- [x] 4.5 `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-230 to D-233, with D-230's row explicitly superseding `D-204` and leaving `D-204` untouched). If an earlier change of this round already rewrote one of these lines, verify it and fix only what is still stale.

## 5. Checks, review, handoff

- [x] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — each its own command with its exit code recorded.
- [x] 5.2 `openspec validate evidence-retention-edges --strict` and `openspec validate --all --strict`; quote both totals.
- [x] 5.3 Review gate per `AGENTS.local.md` §2, with the trust-rule check on the one rule this change could weaken (a file deleted while a dispute still needs it) and the silent-failure pass on the consent subquery returning no row.
- [x] 5.4 Confirm no destructive job was run against the dev database: this change's tests use the fake storage client, and `EVIDENCE_RETENTION_DRY_RUN` is untouched in every environment file.
- [x] 5.5 Handoff in chat: the four triggers with their origins, the consent rule, the two debt rows closed, the `D-204` supersession, and the dry-run eligible count before and after.

## Verification record (2026-11-20)

- Gates: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 — domain 164, web 259, contracts 23, api 386, 0 skipped; `pnpm build` 0.
- Focused: domain `evidence-retention` 7 pass; api `evidence.integration` 10 retention-shaped tests pass (four new cases plus the two updated counts).
- Mutation 1 (drop the consent subquery): "an earlier institution-sharing withdrawal brings a counted outcome due" failed with `deleted` 0 vs 1, restored.
- Mutation 2 (join the mentor's profile instead of the student's): "only the reporting student's withdrawal counts" failed with `examined` 1 vs 0, restored.
- Real dry run against the dev database, `EVIDENCE_RETENTION_DRY_RUN` unset: `{"event":"evidence.retention_swept","examined":0,"eligible":0,"deleted":0,"failed":0,"dryRun":true}` with a storage stub whose `delete` throws — it was never called. `examined` is 0 because the dev database holds no settled outcome past the window; the eligible paths are covered by the integration tests, not by this run.
- Deviation recorded: the candidate query filters on the origin, so `examined` now counts only rows past their origin. The pre-existing boundary test asserted `examined: 1` for an 89-day row; its assertion was updated to `0` and its behavioural claims (nothing deleted inside the window, deleted at exactly 90 days) are unchanged. No scenario in the spec pins `examined`.
- Deviation recorded: `consentWithdrawnAt` arrives as a string from a raw `sql` projection and is coerced with `new Date(...)` before the predicate; without it the row predicate threw `consent.getTime is not a function`.
