# Tasks: mentorship-thread-and-sessions

## 1. Schema, enums, migration, grants

- [ ] 1.1 Add `mentorship_status`, `mentorship_cadence`, `mentorship_session_status` to `services/api/src/db/schema/enums.ts` and `mentorships`, `thread_messages`, `mentorship_sessions` in `services/api/src/db/schema/mentorships.ts`, exporting both from `db/schema/index.ts`; verify `pnpm --filter api typecheck` passes.
- [ ] 1.2 Generate migration `0012` with `pnpm --filter api db:generate`, append the three hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "<table>" TO connect_app;` lines, and verify `grep -c "TO connect_app" services/api/drizzle/0012_*.sql` returns 3.
- [ ] 1.3 Update `services/api/test/database.integration.test.ts`: add the three tables to the asserted list, change the "twenty tables" title to "twenty-three", and add a `SET ROLE connect_app` insert/select probe per new table; verify the test passes under `CI=true`.
- [ ] 1.4 Document the three tables in `docs/data-model.md` §5.3-5.4 (marking `is_paid` inert and `ENDED_EARLY` unexposed) and the enums in §4.1, and rewrite the §4.2 note that says acceptance does not create a `mentorships` row; verify every column and check named in the design appears in the doc and no text still says acceptance creates nothing.

## 2. Domain rules

- [ ] 2.1 Add `packages/domain/src/mentorship.ts` with `MENTORSHIP_STATUSES`, `SESSION_STATUSES`, `CADENCES`, `canAcknowledge`, `nextSessionStatus`, `canComplete`, `isHttpsUrl`, and the body/limit constants, exporting from `packages/domain/src/index.ts`; verify `pnpm --filter @connect/domain test` passes with the new unit test.
- [ ] 2.2 Add `packages/domain/test/mentorship.test.ts` covering: `HELD` only when both confirmations exist, `CANCELLED`/`HELD` terminal, `https://` accepted and `http://`, `ftp://`, and `//` refused, and `canComplete` true only for `ACTIVE`; verify the suite reports the new cases as passing.

## 3. Accept creates the mentorship

- [ ] 3.1 In `services/api/src/requests/drizzle-requests.service.ts`, insert the mentorship inside `decide()`'s transaction after the conditional update, returning the mentorship id on the request payload; verify `test/requests.integration.test.ts` still passes unchanged.
- [ ] 3.2 Add accept-path coverage to `services/api/test/mentorship.integration.test.ts`: one mentorship per acceptance with `request_id` set, a retried accept yields `409` and still one row, a decline creates none, and a forced insert failure leaves the request `PENDING` with no email event; verify the four cases pass.
- [ ] 3.3 Update `docs/known-debt.md` DEBT-20 to Closed with the test names as evidence, and note DEBT-17 as narrowed to the resume half; verify each row names its target change.

## 4. Mentorship read, list, complete

- [ ] 4.1 Add `services/api/src/mentorships/{mentorship.service.ts,drizzle-mentorship.service.ts,mentorships.tokens.ts,mentorships.module.ts}` and register the module in `app.module.ts`; verify `pnpm --filter api typecheck` passes and the module boots in the test stack.
- [ ] 4.2 Add `mentorships.controller.ts` with `GET /v1/mentorships`, `GET /v1/mentorships/{id}`, and `POST /v1/mentorships/{id}/complete`; verify integration tests cover participant `200`, third-party `404`, and a second completion `409 MENTORSHIP_INVALID_STATE`.
- [ ] 4.3 Add every new route to the `MATRIX` in `services/api/test/authorization-matrix.test.ts` and extend that file's Nest stack with the new controller and its tokens; verify the matrix test passes and fails if one route is removed from the table.
- [ ] 4.4 Update `docs/api-contracts.md` §5.4-5.5 with the three routes, the `MENTORSHIP_INVALID_STATE` code in the error catalog, and a replacement for the "no mentorship row is created in this release (#8)" note; verify the documented paths match the controller decorators and no text still says acceptance creates nothing.

## 5. Thread and its email

- [ ] 5.1 Add `GET` and `POST /v1/mentorships/{id}/messages` with keyset pagination on (`created_at`, `id`) and participant resolution in the repository layer; verify integration tests cover oldest-first ordering, the `next_cursor` null on the last page, and third-party `404` on both verbs.
- [ ] 5.2 Enqueue exactly one `EmailRequested` outbox event per message with dedupe key `email:thread-message:<message id>` inside the insert transaction; verify a test asserts one event after one post and still one after a replay.
- [ ] 5.3 Extend `services/api/test/mentorship.integration.test.ts` with `422` cases for an empty body and a body above the bound, and a `404` for the non-existent update route; verify all three pass.
- [ ] 5.4 Document the thread routes, the bound, and the one-email rule in `docs/api-contracts.md` §5.5, and mark FR-THR-01/02 as built in `docs/functional-requirements.md`; verify the doc no longer lists the thread as unbuilt.

## 6. Agreement and sessions

- [ ] 6.1 Add `PUT /v1/mentorships/{id}/agreement` and `POST …/acknowledge` with per-party timestamps that a later acknowledgement does not overwrite; verify integration tests cover one-party ack, both-party ack, and `422` for an unknown cadence.
- [ ] 6.2 Add `POST /v1/mentorships/{id}/sessions` with the `https://` check, duration bounds, and untrusted-link copy in the string catalog; verify tests cover `https` accepted, `http://` refused with `422` naming `meeting_url`, and out-of-range duration refused.
- [ ] 6.3 Add `POST /v1/sessions/{id}/confirm-held` with a row lock so the second confirmation writes `HELD` once; verify tests cover one confirmation leaving `SCHEDULED`, both setting `HELD`, and a cancel after `HELD` returning `409`.
- [ ] 6.4 Document the agreement and session routes, statuses, and the "link is mentor-provided and untrusted" rule in `docs/api-contracts.md` §5.5 and mark FR-SES-01/02 in `docs/functional-requirements.md`; verify FR-MEN-01/02 are updated in the same file.

## 7. Resume capacity check

- [ ] 7.1 In `services/api/src/profiles/drizzle-profiles.service.ts`, count live `ACTIVE` mentorships under the mentor-profile row lock on resume and throw `409 CAPACITY_BELOW_ACTIVE` without writing the mode; verify `test/profiles.integration.test.ts` gains the at-capacity and room cases and both pass.
- [ ] 7.2 Add `CAPACITY_BELOW_ACTIVE` to the problem catalog in `docs/api-contracts.md` §10 and to `packages/contracts/openapi.yaml`; verify the code appears in both and that the profile page shows the message via the string catalog.
- [ ] 7.3 Update `docs/known-debt.md` DEBT-17 to Closed with the resume test named, and state in `docs/api-contracts.md` §5.2 that D-59's request-based count is unchanged; verify no doc still claims resume skips the check.

## 8. Web page and BFF

- [ ] 8.1 Add BFF routes under `apps/web/app/api/mentorships/**` and `apps/web/app/api/sessions/**` following `apps/web/lib/bff.ts`; verify `apps/web/test/mentorship-routes.test.ts` covers forwarding, `401` passthrough, and a non-JSON upstream mapped to `502`.
- [ ] 8.2 Add `apps/web/app/mentorship/[id]/page.tsx` showing the request summary, ordered messages, agreement state, and sessions, with send, acknowledge, schedule, confirm-held, and complete actions; verify `apps/web/test/mentorship-page.test.ts` renders the loading, empty, error, and signed-out states.
- [ ] 8.3 Route every new label and problem message through `apps/web/lib/strings.ts` and add the entries; verify `grep -rn "\"[A-Z][a-z].* \"" apps/web/app/mentorship` finds no hard-coded user-facing sentence.
- [ ] 8.4 Link the page from `apps/web/app/requests/page.tsx` for an `accepted` request, reusing the existing list markup and tokens; verify the link appears for accepted rows only and no new visual direction is introduced.

## 9. Contract

- [ ] 9.1 Add the nine paths and their schemas to `packages/contracts/openapi.yaml`; verify `pnpm --filter @connect/contracts test` passes and the contract test's path inventory matches the controller decorators.
- [ ] 9.2 Regenerate or update any client types the contracts package exports; verify `pnpm typecheck` passes across the workspace.

## 10. Trackers, decisions, and stale-doc fixes

- [ ] 10.1 Add `docs/decision-log.md` rows D-60 (mentorship created in the accept transaction), D-61 (resume refuses with `CAPACITY_BELOW_ACTIVE` while D-59 stays unchanged), and D-62 (one email per thread message, no read state or redaction in the MVP); verify each row has Date, Decision, Reason, Status, Affects.
- [ ] 10.2 Add the DEBT-21 row for duplicate messages on client retry, naming `#8` and the follow-up change that would add an idempotency key; verify the register still has one owner and one target per row.
- [ ] 10.3 Fix the stale statements: `README.md` MFA sentence that says enforcement "arrives with `roles-and-profile-visibility` (4c)", `AGENTS.local.md` line claiming "Schema (Drizzle) and migrations do not exist yet", `README.md` "Last reviewed" and status line, and the "Not built yet" list; verify `grep -rn "arrives with .roles-and-profile-visibility\|migrations do not exist yet"` returns nothing.
- [ ] 10.4 Update `docs/mvp-build-plan.md` §5 row #8 to `DONE` with the evidence line, `docs/milestones-and-phases.md` "Current state" plus Sprint 4 row, and the `README.md` repository-status section; verify all three name this change and the date.
- [ ] 10.5 Correct `docs/milestones-and-phases.md` §5.2 Sprint 2, whose demo line still promises discovery that D-58 deferred, and `docs/mvp-build-plan.md` §5's obsolete "4a → 4c → 4b" ordering sentence; verify neither text contradicts D-58 or the archive order.

## 11. Checks, docs gate, review gate, handoff

- [ ] 11.1 Run `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, and `pnpm build` from the repo root, each as its own command with its exit code captured; verify all four report 0 failures and no skipped integration test.
- [ ] 11.2 Run the docs gate over this change's touched docs (README, `data-model`, `api-contracts`, `functional-requirements`, `known-debt`, `mvp-build-plan`, `milestones-and-phases`, `decision-log`, `AGENTS.local.md`); verify every table, endpoint, and status named in the diff appears in a doc.
- [ ] 11.3 Run the review gate (`ponytail-review`, `ce-code-review`, the trust-rule check, and `ponytail-debt`) on the diff; verify each finding is either fixed in scope or reported with a debt row.
- [ ] 11.4 Write the handoff: commits, per-package gate output, docs changed, stale docs found but not fixed, and anything UNVERIFIED; verify `git log --oneline` on the branch is quoted raw in the report.

## Workflow follow-up

- Archive this change only after the owner reviews the merged PR and says so.
- Re-run `openspec validate --all --strict` after archive and confirm 25 specs including the two modified capabilities.
