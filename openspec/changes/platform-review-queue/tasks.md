# Tasks: platform-review-queue

Two phases. **Phase A (groups 1 to 6)** is a complete backend increment that can merge on its own. **Phase B (groups 7 to 9)** is the page and the checks. If the day runs out, Phase A is the PR and Phase B follows on the same change.

## Phase A — backend

## 1. Ledger reversal schema

- [ ] 1.1 Widen `reputation_events_counted_only` to `event_type IN ('COUNTED', 'REVERSAL')` in `services/api/src/db/schema/reputation.ts`, and replace `reputation_events_outcome_unique` with two partial unique indexes (`COUNTED` and `REVERSAL`, each on `outcome_id`); verify `pnpm --filter api typecheck` passes.
- [ ] 1.2 Generate migration `0015` with `pnpm --filter api db:generate` from fresh `main`, then confirm the file contains `DROP CONSTRAINT "reputation_events_counted_only"`, the re-added check, the dropped unique index, and both partial indexes; verify no enum, table, or grant statement appears in it.
- [ ] 1.3 Apply the migration to the local stack and extend `services/api/test/database.integration.test.ts` to assert one `COUNTED` and one `REVERSAL` row can coexist for one outcome while a second row of either type is refused; verify the test passes under `CI=true`.

## 2. The transition rule

- [ ] 2.1 Extend the outcome transition function in `packages/domain/src/outcome.ts` with the reviewer moves (`IN_PLATFORM_REVIEW` + `valid` → `COUNTED`, `+ invalid` → `REJECTED`, `COUNTED` + `invalid` → `REVERSED`) and a `reviewDecisionIsLegal` predicate; verify `packages/domain/test/outcome.test.ts` covers every legal and illegal pair, including `valid` on `COUNTED`.
- [ ] 2.2 Add a pure helper that computes a reversal's negated points and the snapshot delta from the original `COUNTED` event, so no arithmetic lives in the service; verify a unit test covers a `1/2` pair factor and a zero-point placeholder case.

## 3. The review action

- [ ] 3.1 Add `review()` to `services/api/src/outcomes/{outcome.service.ts,drizzle-outcome.service.ts}`: load the outcome under a row lock, apply the transition guard, and in one transaction write the status, `counted_at`/`rejected_at`/`reversed_at`, one `outcome_events` row (`CASE_RESOLVED` with the decision and reason in the payload), one `verification_records` row (`PLATFORM_DECISION`, `VALID`/`NOT_VALID`, the reason), and one audit row; verify an integration test asserts all four rows for a `valid` decision.
- [ ] 3.2 On the `valid` path set `counted_basis = 'PLATFORM_DECISION'` and write **no** reputation event; verify the test asserts `earnsMentorReputation` is false and the impact counts are unchanged.
- [ ] 3.3 On the `invalid`-from-`COUNTED` path append the `REVERSAL` reputation event (when a `COUNTED` event exists) and decrement the snapshot by one count and the same points; verify `reputation.integration.test.ts` asserts the compensating row, the decremented snapshot, and that the original event is unchanged.
- [ ] 3.4 Extend the replay test with a reversal and assert the recomputed snapshot still equals the stored one; verify the test fails when one stored total is perturbed.
- [ ] 3.5 Queue one email per decision through the outbox with the key `email:outcome-review:<outcome id>:<decision>`; verify the outbox test asserts exactly one event for a retried decision.

## 4. Routes and authorization

- [ ] 4.1 Add `POST /v1/outcomes/:id/review` to `services/api/src/outcomes/outcomes.controller.ts` using `requireRole(identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, with `decision` restricted to `valid|invalid` and `reason` 1 to 1000 characters; verify the integration test covers `403 MFA_REQUIRED`, `403 ROLE_REQUIRED` for a mentor and a student, `422` for a missing or long reason, and `409` for a state outside the transitions.
- [ ] 4.2 Add `GET /v1/review-queue?cursor=&limit=` under the same guard, ordered by `mentor_decision_due_at` ascending, capped at 50, returning the documented case row (kind from the latest verification record, `ESCALATED_D7` when there is none, `opened_at` from the latest event, `waiting_days`); verify the integration test asserts ordering, the cursor, the case kind for a dispute, a conflict, and a day-7 escalation, and that a non-admin is refused.
- [ ] 4.3 Expose `decisions: [{decision, reason, decided_at}]` in `GET /v1/outcomes/{id}` from `PLATFORM_DECISION` verification records; verify both participants read it and a third account still gets `404`.
- [ ] 4.4 Add both routes to the `MATRIX` in `services/api/test/authorization-matrix.test.ts` with the `PLATFORM_ADMIN` requirement and the MFA flag, and extend that test's stack; verify the matrix test passes.

## 5. Contract and data docs

- [ ] 5.1 Add both paths to `packages/contracts/openapi.yaml` (queue read, review action) and the `decisions` array to the outcome schema; verify `pnpm --filter @connect/contracts test` passes and the contract's path inventory equals the controller decorators.
- [ ] 5.2 Document the routes, the decision values, the error codes, the hand-run `INSERT` that grants `PLATFORM_ADMIN` (D-73), and the MFA requirement in `docs/api-contracts.md` §5.6 and §5.9; verify the documented refusals match the tests.
- [ ] 5.3 Correct `docs/data-model.md`: `:176` no longer says `COUNTED`, `REJECTED`, and `REVERSED` are unreachable; §4.5 states the `disputes` table is **not built** and the case is the outcome plus its verification records; §5.6 records the two partial unique indexes; verify no sentence still describes an unbuilt table as current.
- [ ] 5.4 Narrow FR-ADM-01 in `docs/functional-requirements.md` (no assignment, no due dates, one decision per case, in the MVP) and record the clawback rule in `docs/reputation-and-verification-policy.md` §7; verify both name the decision ids.
- [ ] 5.5 Close DEBT-23 in `docs/known-debt.md` with the test evidence, and add a debt row for the unbuilt `disputes` case object naming the change that would own it.

## 6. Phase A checks

- [ ] 6.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test` (`CI=true`), and `pnpm build` from the repo root; record each exit code and the per-package totals.
- [ ] 6.2 Confirm on the local stack that a disputed outcome appears in `GET /v1/review-queue`, a `valid` decision counts it without a reputation event, and an `invalid` decision on a counted outcome reverses it and decreases the snapshot; record the raw requests in the handoff.

## Phase B — page

## 7. BFF and page

- [ ] 7.1 Add `apps/web/app/api/review-queue/route.ts` (session required; forward cursor and limit) and the `review` action to `apps/web/app/api/outcomes/[[...path]]/route.ts`; verify `apps/web/test/review-queue-route.test.ts` covers forwarding, the `401` for no session, and a `403 MFA_REQUIRED` passthrough.
- [ ] 7.2 Generate one Stitch design for the review queue screen and record the project/screen name here before writing markup; verify the implementation follows the generated structure and tokens.
- [ ] 7.3 Add `apps/web/app/admin/reviews/page.tsx`: the case list with kind, reason, wait time, outcome summary, a `valid`/`invalid` choice, a required reason field, and success, empty, error, and refused (`403 MFA_REQUIRED`) states; verify `apps/web/test/review-queue-page.test.ts` renders each state.
- [ ] 7.4 Add the `adminReviews` string group to `apps/web/lib/strings.ts` and an `Admin` link in `apps/web/lib/navigation.ts` shown only when the caller's role set includes `PLATFORM_ADMIN`; verify `apps/web/test/navigation.test.ts` covers both role cases.

## 8. Docs and tracker

- [ ] 8.1 Update `docs/mvp-build-plan.md` §5 (row 10b `DONE`), `docs/milestones-and-phases.md` "Current state", and the `README.md` status line with the change, the PR, and the gate totals.
- [ ] 8.2 Add the `D-73` to `D-77` rows to `docs/decision-log.md` if they are not already present from the propose round, and confirm no current-truth doc still says the review queue is unbuilt.

## 9. Checks and handoff

- [ ] 9.1 Run the four gates again from the repo root with `CI=true` and record the exit codes and totals.
- [ ] 9.2 Run the review gate (ponytail review and audit, code review, silent-failure hunt, trust-rule check on the ledger and the reviewer route) and fix in-scope findings; record the rest.
- [ ] 9.3 Confirm the diff contains only the tasks above and write the handoff naming the PR, the merge commit, the gate totals, and any dev-database writes.
