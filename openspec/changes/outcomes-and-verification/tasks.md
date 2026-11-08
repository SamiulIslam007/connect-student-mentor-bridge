# Tasks: outcomes-and-verification

## 1. Schema, enums, migration, grants

- [ ] 1.1 Add `outcome_status`, `contribution_level`, `outcome_event_type`, `verifier_kind`, `verifier_decision` to `services/api/src/db/schema/enums.ts` and the three tables to `services/api/src/db/schema/outcomes.ts`, exporting both from `db/schema/index.ts`; verify `pnpm --filter api typecheck` passes.
- [ ] 1.2 Generate migration `0013` with `pnpm --filter api db:generate`, then hand-write `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outcomes" TO connect_app;` and `GRANT SELECT, INSERT ON TABLE "outcome_events" TO connect_app;` plus the same insert-only grant for `verification_records`; verify all three lines are present in the migration file.
- [ ] 1.3 Extend `services/api/test/database.integration.test.ts`: add the three tables, change the count wording to twenty-six, and add a probe per new table, including `UPDATE`/`DELETE` refused as `connect_app` on the two ledger tables; verify the test passes under `CI=true`.
- [ ] 1.4 Document the three tables, their checks, and the five enums in `docs/data-model.md` §4.1 and §5.5, marking `counted_basis` and `evidence_tier` as unused in this change; verify every column in the design table appears in the doc.

## 2. Domain state machine and eligibility

- [ ] 2.1 Add `packages/domain/src/outcome.ts` with `OUTCOME_STATUSES`, `OUTCOME_ACTIONS`, `transition(from, action)`, `earnsMentorReputation(outcome)`, `coolingEndsAt(confirmedAt, days)`, and the field limits, exporting from `packages/domain/src/index.ts`; verify `pnpm --filter @connect/domain test` passes.
- [ ] 2.2 Add `packages/domain/test/outcome.test.ts` covering every legal pair from the data-model table and every illegal pair answering null, plus eligibility true only for a mentor-confirmed outcome with no declared conflict; verify the suite reports each case.
- [ ] 2.3 Add `OUTCOME_COOLING_PERIOD_DAYS = 14` to `packages/config/src/index.ts` with a comment marking it a Proposed default (`docs/api-contracts.md` API-O7); verify `pnpm --filter api typecheck` and `pnpm --filter @connect/config typecheck` both pass.

## 3. Reporting an outcome

- [ ] 3.1 Add `services/api/src/outcomes/{outcome.service.ts,drizzle-outcome.service.ts,outcomes.tokens.ts,outcomes.module.ts}` and register the module in `app.module.ts`; verify the module boots in the test stack and `pnpm --filter api typecheck` passes.
- [ ] 3.2 Implement `POST /v1/outcomes` in `outcomes.controller.ts`: participant-only resolution, field/profile keys copied from the mentorship, `422` on a missing description or unknown type, `404` for a non-student; verify integration tests cover the valid report, both `422` cases, the mentor `404`, and the third-account `404`.
- [ ] 3.3 Write the `REPORTED` event, set `mentor_decision_due_at` to seven days, and enqueue one outbox email to the mentor in the same transaction; verify a test asserts one event, the due date, and exactly one email event.
- [ ] 3.4 Add `GET /v1/outcomes` and `GET /v1/outcomes/{id}` restricted to participants; verify tests cover participant `200` and third-party `404` on both.
- [ ] 3.5 Mark FR-OUT-01 in `docs/functional-requirements.md` as built by this change and document the report endpoint in `docs/api-contracts.md` §5.6; verify the documented body matches the controller's accepted fields.

## 4. Confirm, dispute, conflict, withdraw

- [ ] 4.1 Implement `POST /v1/outcomes/{id}/confirm` under an outcome row lock: `CONFIRMED`, `confirmed_at`, `cooling_ends_at` from the config value, a `MENTOR_CONFIRMATION` record carrying `contribution_level_confirmed`, and no counted state; verify tests cover the confirmation, a contribution level different from the claim, a double confirm `409`, and the student's `404`.
- [ ] 4.2 Implement `POST /v1/outcomes/{id}/dispute` with a required reason: `IN_PLATFORM_REVIEW`, one `MENTOR_DISPUTE` record carrying the statement, one email to the student, `422` on an empty reason; verify all three cases pass.
- [ ] 4.3 Handle `coi_declaration` on confirm: `IN_PLATFORM_REVIEW`, `coi_declared` true, `CONFLICT_OF_INTEREST` record, and no confirmation stored; verify a test asserts the status, the flag, and that the eligibility predicate answers false.
- [ ] 4.4 Implement `POST /v1/outcomes/{id}/withdraw` for the three open states only; verify tests cover each allowed state, `409` on a closed state, and the mentor's `404`.
- [ ] 4.5 Mark FR-OUT-03/04/05/06/11 in `docs/functional-requirements.md` and document the three decision endpoints plus `OUTCOME_INVALID_STATE` in `docs/api-contracts.md` §5.6 and §10; verify no documented transition contradicts the data-model table.

## 5. Events, audit, and the append-only ledger

- [ ] 5.1 Append one `outcome_events` row per transition with a locked `seq` increment and the matching `from_status`/`to_status`; verify a test walks report → confirm → withdraw and asserts `seq` 1, 2, 3 with no gap.
- [ ] 5.2 Extend `AuditAction` in `services/api/src/identity/audit-log.ts` with the six outcome actions and append one audit entry per transition inside the same transaction; verify a test asserts one audit row per transition naming the actor and the outcome.
- [ ] 5.3 Assert the database refusals directly: as `connect_app`, `UPDATE` and `DELETE` on `outcome_events` and `verification_records` fail; verify both probes are in `database.integration.test.ts` and pass.
- [ ] 5.4 Document the event type list, the gap-free `seq` rule, and the audit actions in `docs/data-model.md` §5.5 and `docs/security-requirements.md`'s audit section; verify the documented list matches the enum.

## 6. Timers

- [ ] 6.1 Extend the sweeper with an outcome pass for day 3 and day 5 reminders and day 7 escalation, guarded by the partial unique indexes; verify tests cover the day-3 reminder, a second run writing nothing, the day-7 escalation to `IN_PLATFORM_REVIEW`, and a decided outcome left untouched.
- [ ] 6.2 Queue one email per timer effect through the outbox with a dedupe key that includes the event type; verify a test asserts exactly one email event per reminder.
- [ ] 6.3 Document the 3/5/7 timings and their "at most once" guarantee in `docs/reputation-and-verification-policy.md` and `docs/data-model.md` §4.4; verify the timings match the constant names in code.

## 7. Contract

- [ ] 7.1 Add the six outcome paths and their schemas to `packages/contracts/openapi.yaml`, deliberately omitting the evidence endpoints; verify `pnpm --filter @connect/contracts test` passes and the contract's path inventory equals the controller decorators.
- [ ] 7.2 Add a known-debt row recording that the evidence endpoints in `docs/api-contracts.md` §5.6 are documented but unbuilt (target: the evidence change), and that the contract omits them on purpose; verify the row names its owning change.

## 8. Web UI

- [ ] 8.1 Add the outcome BFF routes under `apps/web/app/api/outcomes/**` following `apps/web/lib/bff.ts`; verify `apps/web/test/outcome-routes.test.ts` covers forwarding, `401` passthrough, and a non-JSON upstream mapped to `502`.
- [ ] 8.2 Add the outcome section to `apps/web/app/mentorship/[id]/page.tsx` (or its component) with the student report form and the mentor confirm/dispute/conflict actions; verify `apps/web/test/outcome-section.test.ts` renders the loading, empty, error, and signed-out states.
- [ ] 8.3 Route every new label through `apps/web/lib/strings.ts` and add the entries; verify no hard-coded user-facing sentence remains in the new components.
- [ ] 8.4 Show the platform-decided label and the "unconfirmed never counts" copy on the outcome view, reusing existing typography tokens; verify the copy appears only for the matching state.

## 9. Decisions, debt, and trackers

- [ ] 9.1 Add `docs/decision-log.md` rows D-63 (`OUT-Q1`: a platform-decided outcome never earns mentor reputation; it counts only for student progress and aggregates, labelled platform-decided), D-64 (evidence is Tier 0 only in the MVP; no upload, no signed URLs, no scan), and D-65 (this change stops at `CONFIRMED`; counting belongs to `reputation-ledger-and-counting`); verify each row carries Date, Decision, Reason, Status, Affects.
- [ ] 9.2 Update `docs/data-model.md` §4.4 and `docs/reputation-and-verification-policy.md` so the eligibility rule reads as decided rather than a recommendation, and remove the `OUT-Q1` open marker from `docs/assumptions-and-open-questions.md`; verify `grep -rn "OUT-Q1" docs/` shows only the decision-log row and no "open" label.
- [ ] 9.3 Record the cooling period as an open decision in `docs/assumptions-and-open-questions.md` and the decision log's open list, quoting `docs/api-contracts.md` API-O7 and the config constant; verify the doc never presents 14 days as decided.
- [ ] 9.4 Update `docs/mvp-build-plan.md` §5 row #9, `docs/milestones-and-phases.md` "Current state" and Sprint 5 row, and the `README.md` status line; verify all three name this change and the date.

## 10. Checks, docs gate, review gate, handoff

- [ ] 10.1 Run `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, and `pnpm build` from the repo root, each as its own command with its exit code captured; verify all four report 0 failures and no skipped integration test.
- [ ] 10.2 Run the docs gate over the touched docs (`data-model`, `api-contracts`, `functional-requirements`, `reputation-and-verification-policy`, `assumptions-and-open-questions`, `security-requirements`, `known-debt`, `mvp-build-plan`, `milestones-and-phases`, `README`); verify every table, enum, endpoint, and transition in the diff appears in a doc.
- [ ] 10.3 Run the review gate plus the trust-rule check (unconfirmed never counts, append-only ledger, object-level authorization, audit trail); verify each finding is fixed in scope or reported with a debt row.
- [ ] 10.4 Write the handoff with commits, per-package gate output, docs changed, and anything UNVERIFIED; verify the raw `git log --oneline` is quoted.

## Workflow follow-up

- Archive only after the owner reviews the merged PR and says so.
- The eligibility predicate stays inert until `reputation-ledger-and-counting` lands; say so in the archive note.
