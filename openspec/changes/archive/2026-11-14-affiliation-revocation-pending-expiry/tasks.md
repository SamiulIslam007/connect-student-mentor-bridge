# Tasks: affiliation-revocation-pending-expiry

## 0. Preconditions

- [x] 0.1 Re-check the snapshot: `git log --oneline -1`, `sed -n '196,250p' services/api/src/affiliations/drizzle-affiliations.service.ts`, `sed -n '126,175p' services/api/src/institutions/drizzle-attestation.service.ts`, `sed -n '96,106p' services/api/src/reputation/drizzle-reputation.service.ts`, `sed -n '36,68p' services/api/src/db/schema/requests.ts`. Record every mismatch.
- [x] 0.2 Confirm the trigger is reachable in production, and write the code path in this file: `claim()` with an explicit `institutionId` whose domains do not match the account email reaches `resolveAffiliationClaim`'s `LEVEL_0`/`PENDING` branch while revoking the earlier `VERIFIED` row.
- [x] 0.3 Confirm no other revocation write exists: `grep -rn '"REVOKED"' services/api/src` and list each hit with its file and line.

## 1. Schema

- [x] 1.1 `services/api/src/db/schema/requests.ts`: add `expiryReason: text("expiry_reason")` plus the check `expiry_reason is null or expiry_reason in ('DEADLINE','MENTOR_INELIGIBLE')`. Verify: `pnpm --filter api typecheck`.
- [x] 1.2 Generate migration `0019` with `pnpm exec drizzle-kit generate`, then hand-add the backfill `UPDATE mentorship_requests SET expiry_reason = 'DEADLINE' WHERE status = 'EXPIRED'` and read the generated SQL before running it. Verify: the file shows the column, the check and the backfill, and `git diff --stat services/api/drizzle` lists exactly one new `.sql` and one snapshot.
- [x] 1.3 `services/api/test/database.integration.test.ts`: the column probe runs as `SET ROLE connect_app`; the table count assertion is unchanged (no new table). Verify: the file's own name still names the same total.

## 2. The helper

- [x] 2.1 New `services/api/src/affiliations/affiliation-expiry.ts`: `expireRequestsWithoutVerifiedAffiliation(tx, { mentorUserId, requestId })` — select one `VERIFIED` affiliation for the account, return early when found, otherwise `UPDATE mentorship_requests SET status = 'EXPIRED', expiry_reason = 'MENTOR_INELIGIBLE' WHERE mentor_profile_id = … AND status = 'PENDING' RETURNING id`, then one `enqueueOutboxEvent` per row with the dedupe key `email:request-expired-ineligible:` followed by the request id and the `request-expired` template. Verify: `pnpm --filter api typecheck`.
- [x] 2.2 Call it at the end of `claim()`'s transaction, after `syncMentorActivation`, and in the attestation `verify` transaction after the audit and notice writes. Verify: `grep -rn "expireRequestsWithoutVerifiedAffiliation" services/api/src` shows exactly two call sites.
- [x] 2.3 `services/api/src/reputation/drizzle-reputation.service.ts`: exclude `MENTOR_INELIGIBLE` from the `late` filter. Verify: `sed -n '96,106p'` shows the added condition and the unit/integration assertions in 3.4 pass.

## 3. Tests

- [x] 3.1 `services/api/test/affiliations.integration.test.ts`: a Level 1 mentor with two `PENDING` requests claims a second institution whose domains do not match → earlier row `REVOKED`, new row `PENDING` at Level 0, both requests `EXPIRED` with `MENTOR_INELIGIBLE`, two outbox rows; a claim whose domain matches → nothing expires; an `ACCEPTED` request and its mentorship are byte-identical (`SELECT to_jsonb(t) AS row` plus `assert.deepEqual`).
- [x] 3.2 `services/api/test/requests.integration.test.ts`: idempotency (run the helper twice, one notice), the student's pending cap frees, the mentor's slot count frees, and `GET /v1/requests` returns the reason.
- [x] 3.3 `services/api/test/attestation.integration.test.ts`: verifying a new claim revokes the old row and expires nothing.
- [x] 3.4 `services/api/test/reputation.integration.test.ts`: `requests_late_or_expired` is unchanged by an eligibility expiry and rises by one for a deadline expiry; `requests_decided_in_time` untouched by both.
- [x] 3.5 Mutations: force the guard to always return early and confirm 3.1 fails on the expiry; drop the `MENTOR_INELIGIBLE` exclusion and confirm 3.4 fails. Restore both, record the results.

## 4. Contract and registries

- [x] 4.1 `packages/contracts/openapi.yaml`: add `expiry_reason` (nullable, enum of the two values) to the request record schema. Verify: `pnpm --filter @connect/contracts test`.
- [x] 4.2 Registry check: no route and no body key changed, so `body-keys.ts`, `authorization-matrix.test.ts` and `request-validation.integration.test.ts` are untouched. Verify: `git diff --stat` shows none of the three.

## 5. Docs

- [x] 5.1 `docs/data-model.md`: the column, its two values, and the note that the reliability aggregate excludes one of them.
- [x] 5.2 `docs/api-contracts.md`: the request record gains `expiry_reason`.
- [x] 5.3 `docs/functional-requirements.md`: `FR-VER-04` to `DONE` with the code path, `FR-REQ-05` gains one line that an eligibility expiry is not a non-response, and §2.16 totals are recomputed from the rows.
- [x] 5.4 `docs/known-debt.md`: no row closes; record the new expiry reason where `DEBT-59` describes today's suspension behaviour, so the two are not confused.
- [x] 5.5 `docs/decision-log.md` (reserved rows at the end of this file), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.

## 6. Gates, review and handoff

- [x] 6.1 One background job, each exit code echoed: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`; per-package totals including skipped.
- [x] 6.2 Line-by-line pass (both call sites, the guard's early return, the migration's backfill, the reliability filter), then an independent adversarial pass on the diff and the two delta specs.
- [x] 6.3 Handoff: the trigger path quoted, both call sites, the migration number, the reliability change, both mutations, `FR-VER-04` closed, and the gate totals.

## Decision rows to add at apply

Written at apply as **`D-165 … D-168`**. `D-164` was the last recorded row when this file was written; the earlier changes of the round took 156 to 164, so this change starts at 165.

- **D-165**: Eligibility is lost when the account holds no `VERIFIED` affiliation, evaluated after the writes in the same transaction, not when a revocation statement runs. Reason: the attestation path revokes and verifies in one transaction and must expire nothing. Affects: `institutions/affiliation-verification`, `mentorship/request-lifecycle`.
- **D-166**: `mentorship_requests.expiry_reason` distinguishes `DEADLINE` from `MENTOR_INELIGIBLE`, with a backfill so existing rows read as deadlines. Reason: response reliability must not penalise a mentor who could not decide. Affects: `docs/data-model.md`, `docs/api-contracts.md`, `mentorship/reputation-ledger`.
- **D-167**: The notice reuses the `request-expired` template with reason-specific text. Reason: the fact is unchanged and the union already names it; a second template buys nothing user-visible. Affects: `docs/data-model.md`, `docs/api-contracts.md` (no change), `mentorship/request-lifecycle`.
- **D-168**: No audit action is added for the expiry; the cause is the `AFFILIATION_REVOKED` row. Reason: the sweeper writes no audit row today and the documented action list has no expiry event. Affects: `docs/auth-and-access-control.md` (a note, not a table row).

## Apply record (2026-11-14)

- Preconditions: two revocation writes confirmed (`claim` at `drizzle-affiliations.service.ts`, the attestation `verify` branch at `drizzle-attestation.service.ts`); `grep -rn '"REVOKED"' services/api/src` returns those two writes plus the enum and read models. Migration `0019` is the next free number (the last applied was `0018`).
- Migration `0019_wet_war_machine.sql`: the column, the two-value check, and a hand-written backfill `UPDATE mentorship_requests SET expiry_reason = 'DEADLINE' WHERE status = 'EXPIRED'`. No new grant (the column rides an existing table's grant). Proofs: the whole test suite replays every migration onto a fresh `connect_test`; a scratch database with one pre-existing `EXPIRED` request was migrated through `0018`, seeded, then given `0019` — the row came out `DEADLINE` and a `'NONSENSE'` value was refused by `mentorship_requests_expiry_reason_known`.
- Deviations from the task list, and why:
  1. The 48-hour sweeper also writes `expiry_reason = 'DEADLINE'` (`request-sweeper.ts`). The proposal only named the new helper, but without this every future deadline expiry would carry `null` and the column would only ever describe the rare case.
  2. `appOrigin()` was a private function in `request-sweeper.ts`; it moved to `services/api/src/email/app-origin.ts` so the new helper links to the same origin instead of copying the logic. Behaviour is unchanged.
  3. The reliability rule lives in two places that must agree (`drizzle-reputation.service.ts` and the pure `responseReliability`), and the existing parity test compares them on the same rows, so `RequestTimingRow` gained an optional `expiryReason` and the pure function gained the same exclusion. The task named only the SQL side; leaving the pure rule alone would have made the parity test a lie.
- Task 3.3's attestation case is proven twice: the existing `attestation.integration.test.ts` suite still passes with the call in place, and `requests.integration.test.ts` adds "a claim that stays verified expires nothing" for the guard's early return.
- Mutations, both caught and restored: the guard forced to always return early fails "losing Level 1 expires every pending request" and "a second run expires nothing twice"; dropping the `MENTOR_INELIGIBLE` exclusion from the aggregate fails "an eligibility expiry is not a non-response".
- Tests: `requests.integration.test.ts` 22 (four new: the expiry with its notice and the pair read, idempotency plus the freed slot, the `DEADLINE` path through the sweeper, and the verified-claim no-op), `reputation.integration.test.ts` 9 (a parley mapping that now carries the reason plus one new case), `database.integration.test.ts` 4 (the app-role probe on the new column), `packages/domain` 134 (the pure rule's new branch). FR-VER-04 is `DONE`; register 56.0 / 64 = 87.5%, code-only 53.0 / 64 = 82.8%, both recomputed from the rows.
