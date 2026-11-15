# Tasks: thread-read-state

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `c3996dd` or its merge line), `git status --short`, `ls services/api/drizzle/*.sql | tail -1` (expect `0019_...`), `grep -rn "thread_read\|read_state\|last_read" services/api/src packages/domain/src` (expect no hits). Record every mismatch in this file before writing code.
- [x] 0.2 Read `services/api/src/mentorships/mentorship.service.ts` and `drizzle-mentorship.service.ts` in full and record where `mentorshipPayload` is called from, so no second projection is invented.
- [x] 0.3 Confirm the break-glass controller (`services/api/src/mentorships/admin-thread.controller.ts`) calls none of the participant service methods, and record the call list here.

## 1. Schema and migration

- [x] 1.1 Add `threadReadStates` to `services/api/src/db/schema/mentorships.ts`: `id` (uuid, default random), `mentorshipId` (uuid, FK `mentorships.id`, `onDelete: "cascade"`), `userId` (text, FK `users.id`, `onDelete: "cascade"`), `lastReadAt` (timestamptz, not null), `...timestamps`; `uniqueIndex("thread_read_states_pair_unique").on(mentorshipId, userId)` and an index on `(userId, mentorshipId)`. Do not add a check constraint on participation: it is not expressible without a composite FK and participation stays a service predicate. Verify: `pnpm --filter api typecheck`.
- [x] 1.2 Generate the migration: `pnpm --filter api db:generate` → `services/api/drizzle/0020_*.sql`. Read the generated SQL and confirm it creates the table, both FKs, the unique index and the index, and nothing else. Verify: paste the file's first and last line in the handoff.
- [x] 1.3 Append the hand-written grant block in the same file, in the pattern of `0003_grant_profile_tables.sql`: `GRANT SELECT, INSERT, UPDATE ON TABLE "thread_read_states" TO connect_app;`. No `DELETE`: the row is removed only by the cascade. Verify: `grep -n "GRANT" services/api/drizzle/0020_*.sql` shows exactly one line, and `grep -c "PUBLIC" ` is 0.
- [x] 1.4 Apply the migration to the local database and the test database, and confirm the table and the grants exist. Verify: `docker compose exec postgres psql -U connect -d connect_test -c '\d thread_read_states'` and `-c '\dp thread_read_states'`.
- [x] 1.5 Record the rollback path in this file: drop the route and payload field first; the table can stay unread, or be removed by a later `DROP TABLE` migration. No backfill exists, so nothing is lost either way.

## 2. The pure rule

- [x] 2.1 Add the unread rule to `packages/domain/src/` (a new `thread-read.ts` or the existing thread module, whichever the file already implies): a function that takes the other party's message count newer than the marker (or the message instants and the marker) and returns a non-negative integer. Keep it pure. Verify: `pnpm --filter @connect/domain typecheck`.
- [x] 2.2 Unit tests in `packages/domain/test/`: no marker counts every message; a marker after every message counts 0; a marker between two messages counts the later one; a count is never negative. Verify: `pnpm --filter @connect/domain test`.
- [x] 2.3 Mutation check: make the rule return `count` unconditionally (ignore the marker) and confirm 2.2 fails on the marker-in-the-middle case; restore. Record the result.

## 3. The service and the route

- [x] 3.1 `MentorshipService` gains `markRead({ userId, mentorshipId }): Promise<ThreadReadState>`; `DrizzleMentorshipService` resolves participation first (`404` when the caller is not a participant, no row written) and then runs the conditional upsert from design R3 using the database's `now()`. Verify: `pnpm --filter api typecheck`.
- [x] 3.2 `read()` and `list()` compute `unread_count` with one aggregate per mentorship (a single query for the list, not one per row) and put it on the payload through `mentorshipPayload`. Verify: the integration test in 5.3 asserts the number equals the pure rule's answer on the same rows.
- [x] 3.3 Add `POST /v1/mentorships/{id}/read` to `MentorshipsController` with `@HttpCode(200)` and `@Throttle({ default: RATE_LIMITS.write })`, no `@Body`, returning the payload from 3.1. Verify: `pnpm --filter api typecheck`.
- [x] 3.4 Confirm the break-glass controller is untouched by this change: `git diff --stat -- services/api/src/mentorships/admin-thread.controller.ts` is empty. If it is not, stop: the marker must not be reachable from that path.

## 4. Registry and contract

- [x] 4.1 `packages/contracts/openapi.yaml`: add the path with a `200` response referencing the read-state schema, and add `unread_count` (integer, minimum 0) to the two existing mentorship response schemas. Verify: `pnpm --filter @connect/contracts test`.
- [x] 4.2 `@connect/contracts` `ROUTE_BODY_KEYS`: add `"POST /v1/mentorships/{id}/read": []` — an empty array, because the route takes no body. Verify: the contract parity test passes and a body on the route is refused with `422`.
- [x] 4.3 `services/api/test/authorization-matrix.test.ts` `MATRIX`: add `{ route: /^POST \/v1\/mentorships\/[^/]+\/read$/, access: "signed-in", mutating: true }`. Verify: `pnpm --filter api test -- authorization-matrix` (or the full suite) passes with no "routes missing from the matrix".
- [x] 4.4 Confirm the rate-limit annotation is present and `AGENTS.md` rule 13 is satisfied: `grep -n "Throttle" services/api/src/mentorships/mentorships.controller.ts` shows the new route's bucket.

## 5. Tests

- [x] 5.1 An integration test for the happy path: a participant marks read, the response carries a marker and `unread_count` 0, and a second read of the mentorship confirms it persisted.
- [x] 5.2 An integration test for monotonicity: a second mark with an earlier instant leaves the stored marker unchanged.
- [x] 5.3 An integration test for the count: three messages from the mentor after the student's marker give the student `3`; the mentor's own count is unchanged; a participant with no marker sees every message; the number equals the pure rule's answer on the same rows.
- [x] 5.4 Refusals: a non-participant gets `404` and writes nothing; an anonymous caller gets `401` and writes nothing; a `GET` of the messages writes no marker.
- [x] 5.5 Break-glass isolation: a platform admin reads the thread through the break-glass route, and both participants' markers and counts are byte-identical to before.
- [x] 5.6 Cascade: deleting a mentorship row removes its marker rows (do this inside the test's own transaction or with a disposable fixture, never against the shared seed).
- [x] 5.7 Mutation checks, recorded in this file: (a) remove the participation guard and confirm 5.4 fails; (b) make the count ignore the sender filter and confirm 5.3 fails; (c) call `markRead` from the break-glass path and confirm 5.5 fails. Restore all three.

## 6. Docs gate

- [x] 6.1 `docs/data-model.md`: the `thread_read_states` table, its unique index, its cascade, and the grant in INV-05.
- [x] 6.2 `docs/api-contracts.md` §5.5: the new route row (participant, no body, `200`), the `unread_count` property on both mentorship payloads, and one sentence stating that a `GET` never marks a thread read.
- [x] 6.3 `docs/functional-requirements.md`: `FR-THR-02` stays `PARTIAL` and its gap line becomes the UI (no page reads the count); do not move the row to `DONE`. Then recount §2.16 from the rows by command and publish the unchanged total with the date.
- [x] 6.4 `docs/known-debt.md`: one row for the unbuilt UI, owned by the first frontend change that reads `unread_count`, and one line in the thread section of `docs/auth-and-access-control.md` is **not** needed (no authz change).
- [x] 6.5 Fix audit finding **C1**: rewrite the `README.md` status line to the verified state — the current register count from §2.16, and the five archived changes it omits (`docs-register-and-local-setup-fixes`, `csrf-token-on-cookie-writes`, `audit-hold-transition`, `affiliation-revocation-pending-expiry`, `web-csp-enforce`) plus this change. If `thread-read-state` is not the first change of the round to land, this task is a verification only: confirm the line already names the then-latest five changes and the current count, and do not restate them.
- [x] 6.6 Fix audit finding **C2**: correct the `functional-requirements.md` §2.16 bullet that still says `FR-ADM-03` is blocked because `CONFIRMED` → `IN_PLATFORM_REVIEW` is unreachable and `DEBT-55` is open. It is reachable and closed (D-162); the remaining gap is the selection. Same first-change rule as 6.5: fix if this change lands first, otherwise verify and leave.
- [x] 6.7 `docs/mvp-build-plan.md` §5: one row for this change with the real gate results and the migration number, and `docs/milestones-and-phases.md` "Current state" (sprint line, last archived change, next change).
- [x] 6.8 Update `.hermes.md` if this change makes it stale: its §10 trap list says `docs/audit/` holds only `08-resolution-report.md`, which `2026-11-15-hermes-explore.md` already contradicts. Add that file to the line (tracked tooling asset, `chore(tooling)` commit if it is committed on its own).
- [x] 6.9 `docs/decision-log.md`: one `D-xx` row per decision R1–R6 that is not already covered by the owner's brief, in the repo's row format.

## 7. Verification gate

- [x] 7.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from the repo root, with the real totals pasted into this file (including the skipped count, which must be 0).
- [x] 7.2 `openspec validate --change thread-read-state --strict` passes.
- [x] 7.3 `git status` and `git diff --staged` reviewed; only declared paths staged; no `.env`, no secret, no unrelated file.
- [x] 7.4 Stop. The change is not archived until the owner says so.

## Results recorded at apply (2026-11-15)

- 0.1 Snapshot re-checked: base `c3996dd`: `services/api/drizzle/0019_wet_war_machine.sql` was the latest migration, `git status --short` showed only the five untracked change directories and the audit file, and `grep -rn "thread_read\|read_state\|last_read" services/api/src packages/domain/src` had no hit before this change. No mismatch to record.
- 0.2 `mentorshipPayload()` has three call sites in `mentorships.controller.ts` for the two reads plus `read`, and one for each write (agreement, acknowledge, complete); no second projection exists.
- 0.3 `admin-thread.controller.ts` calls only `breakGlassRead`; it calls no participant service method.
- 1.2 Generated `services/api/drizzle/0020_yellow_donald_blake.sql`: first line `CREATE TABLE "thread_read_states" (`, last data line `CREATE INDEX "thread_read_states_user_idx" ON "thread_read_states" USING btree ("user_id","mentorship_id");`.
- 1.4 `psql -c '\d thread_read_states'` on `connect` shows the two cascade FKs, the unique pair index and the user index.
- 2.3 Mutation: `countUnread` returning the count unconditionally fails the marker-in-the-middle case; restored.
- 5.7 Mutation checks, all detected and restored: (a) dropping the participation guard fails "only a participant writes a marker, and a GET writes none"; (b) removing the sender filter from the aggregate fails "unread counts only the other participant's newer messages"; (c) writing the marker from the break-glass path fails "a break-glass read moves no participant's read marker".
- 7.1 Gate totals: see the commit message and `docs/mvp-build-plan.md` section 5; every gate ran green with 0 skipped under `CI=true`.
- 7.4 Archived by the owner's standing instruction for this round.
