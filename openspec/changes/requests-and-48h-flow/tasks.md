# Tasks

## 1. Storage

- [ ] 1.1 Add `request_status`, `interaction_type`, and `timeframe_bucket` enums plus the `mentorship_requests` table (columns and checks from `docs/data-model.md` §5.3, the one-pending-per-pair partial unique index, the `interaction_type <> 'GROUP_OFFICE_HOURS'` check, `version` default 1) — verify `drizzle-kit generate` emits one migration and the existing suites still pass
- [ ] 1.2 Append the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON mentorship_requests TO connect_app` — verify the migration applies to a fresh database and to the existing one
- [ ] 1.3 Extend the `SET ROLE connect_app` probe in `services/api/test/database.integration.test.ts` to insert, select, and update a request — verify `CI=true pnpm --filter api test database` passes

## 2. Domain rules

- [ ] 2.1 Add `packages/domain/src/request.ts`: `requestTransition(status, action)` returning the next status or a refusal, `slotsInUse({ pending, acceptedInWindow })`, and `canCreateRequest({ mentor, caller, slotsInUse, weeklyCapacity, pendingForPair, pendingForStudent, applicationNote })` — verify unit tests drive every transition pair (including the refused ones) and the capacity boundary at cap − 1, cap, cap + 1
- [ ] 2.2 Cover the access-mode rule in that predicate: `APPLICATION_ONLY` requires a non-empty note, `OPEN` does not, `PAUSED` refuses — verify unit tests match every scenario in the modified `profiles/availability-and-access-mode` requirement
- [ ] 2.3 Export the module from `packages/domain/src/index.ts` — verify `packages/domain/test/index.test.ts` passes

## 3. Request endpoints

- [ ] 3.1 Add `services/api/src/requests/` (module, service, controller, tokens) with `POST /v1/requests`: validate fields, load the addressee, lock its profile row, count slots, insert with `ON CONFLICT DO NOTHING`, and queue the received email — verify integration tests cover a valid create, each refusal (`MENTOR_NOT_VERIFIED`, `MENTOR_UNAVAILABLE`, `MENTOR_AT_CAPACITY`, `DUPLICATE_PENDING_REQUEST`, `REQUEST_LIMIT_REACHED`, self-request, missing field, over-length field, group office hours), and that each refusal writes nothing
- [ ] 3.2 Add `POST /v1/requests/{id}/accept` and `/decline` as conditional updates recording `decided_at` and `decision_note`, with the decision email queued once — verify integration tests cover accept, decline with a reason, a second decision (`409`), a non-addressee (`403`), and that no second email event is written
- [ ] 3.3 Add `POST /v1/requests/{id}/withdraw` for the sender while `PENDING` — verify integration tests assert the status change, the freed slot (a previously refused create now succeeds), and `409` on a decided request
- [ ] 3.4 Add `GET /v1/requests` (sent and received, by status, cursor-paged) and `GET /v1/requests/{id}` limited to participants — verify integration tests assert another account gets `404` and that pagination does not repeat or drop a row
- [ ] 3.5 Prove the capacity race: run two concurrent creates against one free slot — verify the integration test asserts exactly one `201` and one `MENTOR_AT_CAPACITY`
- [ ] 3.6 Register all six routes in `services/api/test/authorization-matrix.test.ts` — verify that test fails when a route is removed from the matrix and passes with them present
- [ ] 3.7 Add the six endpoints plus `MENTOR_UNAVAILABLE` and `REQUEST_LIMIT_REACHED` to `packages/contracts/openapi.yaml` — verify `packages/contracts/test/openapi.test.ts` passes and the documented examples validate

## 4. Timer

- [ ] 4.1 Add the request sweeper to the worker: a pg-boss schedule every 5 minutes running the reminder update and the expiry update, each writing one `EmailRequested` outbox event with the documented dedupe key — verify integration tests assert one reminder at 24 hours, no second reminder on a rerun, expiry at 48 hours with one expiry email, and no change to a decided request
- [ ] 4.2 Add the three email bodies and their templates to the outbox `EmailRequested` handler's payload contract — verify the worker test asserts the subject and the link per event type

## 5. Web

- [ ] 5.1 Add `apps/web/app/request/new/page.tsx` (the structured form, application note shown only for `APPLICATION_ONLY`, field errors from the problem body) and its BFF route — verify web tests cover a successful submit, a `422` field error, and a `409` refusal with the right copy
- [ ] 5.2 Add `apps/web/app/requests/page.tsx` with the sent and received lists, accept, decline (with reason), and withdraw, and every string in the catalog — verify web tests cover the mentor view and the student view, and that an empty state is rendered
- [ ] 5.3 Replace the "applications are not built yet" copy in the profile page's access-mode section — verify the profile test asserts the new requirement text

## 6. Documentation

- [ ] 6.1 Update `docs/data-model.md` §4.1 and §5.3 (the MVP column subset, and move the "acceptance creates a `mentorships` row" sentence to #8) and `docs/api-contracts.md` §5.4 plus the error-code table — verify each statement matches the merged code and `grep -n "acceptance creates" docs/data-model.md` names #8
- [ ] 6.2 Update `docs/functional-requirements.md` build notes (FR-REQ-01/02/03/05/06/07/08, FR-DISC-03, FR-PROF-02), close `DEBT-17` except its capacity-on-resume half and add the mentorship debt row, and record the 7-day capacity window as a decision in `docs/decision-log.md` — verify `docs/known-debt.md` lists the remaining DEBT-17 target as #8
- [ ] 6.3 Update `docs/mvp-build-plan.md` §5 row #7, `docs/milestones-and-phases.md` Current state, and `docs/local-setup.md` if a new environment value appears — verify the stated commands run as written

## 7. Integration checks

- [ ] 7.1 Run `CI=true pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and report per-package counts — verify 0 failures, 0 skipped, and the total above the previous change's
- [ ] 7.2 Drive the demo on the running stack: create a request as a seeded student, accept as the mentor, and let a second request expire after a fast-forwarded `expires_at` — verify Mailpit shows the received, decision, and expiry emails and the request rows read back correctly
- [ ] 7.3 Run the review gate (`verify-before-done`, `/ponytail-review`, `/ce-code-review`, `silent-failure-hunter`, trust-rule check, `/ponytail-debt`) and record the findings — verify every finding is fixed in scope or reported as debt

## Workflow follow-up

- Archive the change after the owner approves the review, then verify the archive and the merge.
