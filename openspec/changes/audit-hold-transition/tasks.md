# Tasks: audit-hold-transition

## 0. Preconditions

- [x] 0.1 Re-check the snapshot: `git log --oneline -1`, `sed -n '20,60p' packages/domain/src/outcome.ts`, `sed -n '168,190p' services/api/src/db/schema/enums.ts`, `sed -n '84,92p' services/api/src/db/schema/outcomes.ts`, `sed -n '24,34p' services/api/src/identity/audit-log.ts`. Record every mismatch.
- [x] 0.2 Confirm the two claims this design rests on: `CASE_OPENED` is a member of `outcome_event_type` (so no migration), and `countDueOutcomes` selects `CONFIRMED` rows only (so a held row is skipped). Quote both lines in this file.

## 1. The transition

- [x] 1.1 `packages/domain/src/outcome.ts`: add `"auditHold"` to `OUTCOME_ACTIONS`, and a `case "auditHold": return from === "CONFIRMED" ? "IN_PLATFORM_REVIEW" : null;` arm. Verify: `pnpm --filter @connect/domain test` plus the new cases in 1.2.
- [x] 1.2 `packages/domain/test/outcome.test.ts`: `auditHold` from `CONFIRMED` is `IN_PLATFORM_REVIEW`; from each of the other six states it is `null`; a second hold from review is `null`.
- [x] 1.3 `packages/domain/test/outcome-property.test.ts`: extend the pair table with the new action and confirm the walk still proves no trace reaches `COUNTED` without a confirmation or a review decision. Verify: the file's own counts update (42 pairs becomes 48) and the suite passes.
- [x] 1.4 Mutation check: make `transition("CONFIRMED", "auditHold")` return `COUNTED` and confirm the property test fails; restore and record the result.

## 2. The write path

- [x] 2.1 `services/api/src/identity/audit-log.ts`: add `"OUTCOME_AUDIT_HELD"` to the `AuditAction` union. `services/api/src/audit/audit.service.ts`: add it to `AUDIT_ACTIONS` in the same commit. Verify: `grep -rn "OUTCOME_AUDIT_HELD" services/api/src` shows both files.
- [x] 2.2 `services/api/src/outcomes/drizzle-outcome.service.ts`: add `hold()`, modelled on the review route's conditional update (`WHERE id = … AND status = 'CONFIRMED'`), appending the `CASE_OPENED` event with `from_status CONFIRMED`, `to_status IN_PLATFORM_REVIEW`, the actor, the reason in `payload`, one audit row, and no outbox event. Verify: `pnpm --filter api typecheck`.
- [x] 2.3 `services/api/src/outcomes/outcome.service.ts`: the interface gains `hold()` with its input type; no controller method and no route. Verify: `grep -rn "@Post" services/api/src/outcomes/outcomes.controller.ts` is unchanged.
- [x] 2.4 `services/api/test/outcomes.integration.test.ts`: a confirmed outcome is held (status, one `CASE_OPENED` event, one `OUTCOME_AUDIT_HELD` row, `counted_basis` null); a second hold is `409 OUTCOME_INVALID_STATE` with nothing written; a hold on each illegal state is `409`; the counting job skips the held row; a `valid` review then counts it with `PLATFORM_DECISION` and the mentor's snapshot does not move (D-63).
- [x] 2.5 Registry check (expected: no change, asserted): `git diff --stat -- packages/contracts services/api/drizzle` is empty, `services/api/test/authorization-matrix.test.ts` and `services/api/test/request-validation.integration.test.ts` still pass untouched, because no route and no body changed. If a registry needed a row, stop and re-open the design.

## 3. The surfaces that must not change

- [x] 3.1 `services/api/test/outcomes.integration.test.ts`: a held outcome appears in `GET /v1/review-queue` with its reason, and `GET /v1/admin/audit?action=OUTCOME_AUDIT_HELD` returns the row (`200`, not `422`).
- [x] 3.2 `apps/web/test/outcome-section.test.ts`: one assertion that a held (`in_platform_review`) outcome still renders the withdraw action and the review label — no source edit, this freezes the existing behaviour.

## 4. Docs

- [x] 4.1 `docs/data-model.md` §4.4: T6 is reachable through the `auditHold` action, with the event type it writes and the note that clearing is an ordinary review decision.
- [x] 4.2 `docs/known-debt.md`: close `DEBT-55` with the evidence sentence and name `FR-ADM-03` as the consumer that follows.
- [x] 4.3 `docs/functional-requirements.md`: `FR-ADM-03` keeps `NOT STARTED` but its gap line now names only the sampling job; `FR-OUT-06` untouched.
- [x] 4.4 `docs/auth-and-access-control.md` §12: `OUTCOME_AUDIT_HELD` joins the documented actions, with no route yet.
- [x] 4.5 `docs/decision-log.md` (reserved rows at the end of this file), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.

## 5. Gates, review and handoff

- [x] 5.1 One background job, each exit code echoed: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`; per-package totals including skipped.
- [x] 5.2 Line-by-line pass on the diff (one arm, both audit lists, no route, no migration), then an independent adversarial pass on the diff and the delta spec — specifically that no illegal pair became legal.
- [x] 5.3 Handoff: the pair count, the event and audit action, the no-migration proof (`git diff --stat -- services/api/drizzle` empty), the mutation result, `DEBT-55` closed, and the named follow-up (`FR-ADM-03`).

## Decision rows to add at apply

Written at apply as **`D-162 … D-164`**. `D-155` was the last recorded row when this file was written; the earlier changes of the round took 156 to 161, so this change starts at 162.

- **D-162**: An audit hold reuses the existing `CASE_OPENED` outcome event type and adds one audit action, `OUTCOME_AUDIT_HELD`, to both the writer union and the read filter. Reason: the event enum already names the fact, so a new value would be a migration for a synonym, while a new audit action is the honest label for a case opening. Affects: `mentorship/outcome-verification`, `docs/data-model.md`, `docs/auth-and-access-control.md`.
- **D-163**: The hold is opened by a service method with no route; the sampling change is its first caller, and the no-consumer rule (D-47) is waived deliberately for one change window. Reason: `FR-ADM-03` cannot be specified against a missing table row. Affects: `docs/known-debt.md`, `docs/functional-requirements.md`.
- **D-164**: An audit-cleared outcome counts as `PLATFORM_DECISION` and therefore earns no mentor reputation (D-63), because `outcomes_counted_basis_known` allows only two values. Reason: a third value is a schema check change plus a reputation decision, and the pilot accepts the consequence. Affects: `docs/data-model.md` §4.4, `docs/reputation-and-verification-policy.md` (a sentence, not a rule change).

## Apply record (2026-11-14)

- Preconditions confirmed: `CASE_OPENED` is a member of `outcome_event_type` (`services/api/src/db/schema/enums.ts:181`), and `countDueOutcomes` selects `status = CONFIRMED` rows only (`services/api/src/reputation/counting-job.ts:77`), so a held row is skipped with no query change. No migration was added: `git diff --stat -- services/api/drizzle` is empty.
- Pairs: the property test now asserts **49** pairs (7 states by 7 actions), not the 42 the design quoted — the table gained one action, so the arithmetic grew by seven, and the count in the test is the table's own size rather than a written total.
- `hold()` takes an actor id and role, re-reads the row under the same lock shape the review route uses, and puts the update behind `WHERE id = ... AND status = CONFIRMED` with `.returning()`, so a concurrent count cannot be held and a zero-row match is `409 OUTCOME_INVALID_STATE` with nothing written.
- Task 3.2 needed no page edit, as the design predicted: `apps/web/test/outcome-section.test.ts` already asserted that `in_platform_review` offers withdraw and carries the review label. One named test was added so the audit hold's landing state is frozen explicitly (244 web tests).
- Task 3.1's audit-filter half is satisfied by `services/api/test/audit-read.integration.test.ts`, which iterates every derived `AUDIT_ACTIONS` value and asserts a `200`; `OUTCOME_AUDIT_HELD` joins that list from the union (D-155's shape), so no new assertion was needed there.
- Mutation check: `transition("CONFIRMED", "auditHold")` forced to return `COUNTED` fails "pair depth: every (state, action) pair equals the data-model table"; restored.
- Tests added: four in `services/api/test/outcomes.integration.test.ts` (the hold writes one event and one audit row and queues no email; a second hold is refused and writes nothing; a hold is refused from `PENDING_CONFIRMATION` and `WITHDRAWN` and changes nothing; the counting predicate excludes a held row and the review queue lists it). `node --import tsx --test test/outcomes.integration.test.ts` -> 16 tests / 0 fail.
