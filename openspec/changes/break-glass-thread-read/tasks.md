# Tasks: break-glass-thread-read

## 0. Preconditions

- [ ] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1` (expect `6e88994`), `git status`, `grep -n "@Get\|@Post" services/api/src/mentorships/mentorships.controller.ts`, `grep -n "breakGlass\|reason" services/api/src/db/schema/trust.ts`, `grep -n "break_glass\|reason" services/api/src/identity/audit-log.ts`, `sed -n '1,40p' apps/web/app/admin/reports/page.tsx`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff.
- [ ] 0.2 Read the current participant read end to end (the controller method at `@Get(":id/messages")`, the service read it calls, and the projection it returns) and record the exact key set in this file. The admin route reuses it verbatim; writing the key set down first is what makes "one shape, not two" checkable.
- [ ] 0.3 Grep the tests that freeze the report-queue key set: `grep -rn "target_kind\|targetKind\|ReportRow" packages/contracts/test services/api/test apps/web/test`. List every file that must change in this file before running any suite.

## 1. The guard and the audit action

- [ ] 1.1 Add `THREAD_BREAK_GLASS_READ` to `AuditAction` in `services/api/src/identity/audit-log.ts`. Verify: the compiler names every consumer and `pnpm --filter api typecheck` passes.
- [ ] 1.2 Add `services/api/src/mentorships/admin-thread.controller.ts` with one route, `POST /v1/admin/mentorships/:id/break-glass-read`, behind `requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, decorated `@Throttle({ default: RATE_LIMITS.write })`, the id validated as a uuid, and the response setting `Cache-Control: no-store`. Register it in `services/api/src/mentorships/mentorships.module.ts` beside the participant controller. Verify: `pnpm --filter api typecheck` passes and the module resolves in the integration stack.

## 2. The read

- [ ] 2.1 Implement the route body in the order `design.md` D-121 fixes: authorize, validate the reason (trimmed, 1 to 1000 characters, message states the bound), resolve the mentorship (`404` when absent), append one `THREAD_BREAK_GLASS_READ` audit row with `break_glass` true, the reason, the actor and the mentorship id, then read the messages oldest first plus the agreement and the session records through the existing participant reads, and return them. Verify: an integration test asserts the successful payload's exact key set, the content order, the absence of outcome, profile and email text, and that exactly one audit row exists with all four values.
- [ ] 2.2 Assert the refusals one by one, each also asserting that no audit row was written: no reason (`422`), empty reason (`422`), 1001 characters (`422`), a mentor caller (`403`), an institution admin caller (`403`), a platform admin without an enrolled second factor (refused before any write), an unknown mentorship id (`404`), and an anonymous caller (`401`). Verify: eight assertions, each with its own message naming the case.
- [ ] 2.3 Add the nullable mentorship id to the report-queue projection in `services/api/src/reports/drizzle-reports.service.ts`, populated only when the target is a message, and leave every other field untouched. Verify: `services/api/test/reports.integration.test.ts` asserts the field is present for a message target, null for a user or outcome target, and that the rest of the key set is unchanged apart from the one addition.

## 3. Contract and the four registries

- [ ] 3.1 Add `POST /v1/admin/mentorships/{id}/break-glass-read` to `packages/contracts/openapi.yaml` with its request schema (`reason`) and its `200`/`400`/`401`/`403`/`404`/`422` responses, plus its response schema referencing the existing thread and mentorship shapes where they already exist. Add the nullable property to the report-queue entry schema. Verify: `pnpm --filter @connect/contracts test` passes.
- [ ] 3.2 Add `"POST /v1/admin/mentorships/:id/break-glass-read": ["reason"]` to `packages/contracts/src/body-keys.ts`. Verify: the body-key parity test passes.
- [ ] 3.3 Add the `MATRIX` row to `services/api/test/authorization-matrix.test.ts` with `access: "PLATFORM_ADMIN"`, `mutating: true`, and a body probe carrying a `reason`, and add `AdminThreadController` plus its provider tokens to that file's controller and provider lists. Verify: the matrix test passes and reports the route as platform-admin.
- [ ] 3.4 Add `AdminThreadController` and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: the file passes with no "allowlisted without a route" and no "route without an allowlist".

## 4. The web action

- [ ] 4.1 Add the BFF route at `apps/web/app/api/admin/mentorships/break-glass/route.ts` by copying the nearest admin write route and replacing only the upstream path; count the `../` depth and never hand-write an Authorization header. Verify: the route test asserts the forwarding, the status passthrough for `403`, `404` and `422`, and a non-JSON upstream mapping to `502`.
- [ ] 4.2 Extend the report row type in `apps/web/lib/reports.ts` with the nullable mentorship id, and add a pure formatter for the returned thread summary (message count, first and last timestamp, agreement present or absent, session count) so the rendering logic is testable without a renderer. Verify: a unit test asserts the formatter on an empty thread, a single message and a thread with two sessions.
- [ ] 4.3 Add the "Read thread" control to `apps/web/app/admin/reports/page.tsx`: rendered only for a row whose target is a message and whose mentorship id is known, revealing a required reason input, showing the returned messages and the agreement and session summary inline, with a close control, a loading state and an error state. Stitch is not used; the control follows the page's existing suspend form pattern. Verify: a page test reads the file and asserts the conditional render, the required reason field, the fetch call, and that the control is absent for a non-message target.
- [ ] 4.4 Add the strings for the control, its reason label and its errors to `apps/web/lib/strings.ts`. Verify: `grep -rn "Read thread" apps/web/app` finds no literal outside the catalog.

## 5. Docs and decisions

- [ ] 5.1 Update `docs/api-contracts.md` section 5.5 with the route, its access, its body bound, its order of operations and its refusals, and section 5.9 with the new queue field.
- [ ] 5.2 Update `docs/auth-and-access-control.md` and `docs/security-requirements.md` with the break-glass rule: actor, second factor, mandatory reason, audit before content, and the refusal to notify participants.
- [ ] 5.3 Update `docs/functional-requirements.md` marking `FR-ADM-06` built and `FR-THR-03` complete, and `docs/known-debt.md` closing `DEBT-30` with its evidence plus the new disclosure row (full text at the end of this file).
- [ ] 5.4 Add the decision rows `D-120` to `D-124` and this change's `R` rows to `docs/decision-log.md` (full text at the end of this file).
- [ ] 5.5 Update `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three docs agree on status, PR number and date.

## 6. Gates, review and handoff

- [ ] 6.1 Run from the repo root with Docker up: `pnpm lint`, then `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run; a run with skipped files and zero failures is UNVERIFIED. Run the four gates as one background job writing to a log file and poll it. CI creates `connect_test` itself and the whole checks job takes about 3.5 minutes.
- [ ] 6.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`, plus `/ponytail-audit` because this touches authorization and private content.
- [ ] 6.3 Run an **independent second review pass** of the diff against the trust rules in `AGENTS.local.md` section 2, in a fresh context: hand over only the diff, the delta spec and the test file, and require the reviewer to answer explicitly whether the route can return content without an audit row, whether any projection field discloses outcome, profile or email text, whether the second factor is enforced on every path, and whether any other caller can reach the read. Record the reviewer's verdict in the handoff; if the pass cannot be independent, say so in those words.
- [ ] 6.4 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the four gate totals, the audit-row assertion, the eight refusal assertions and the second-review verdict.

## Decision rows to add at apply

Add each to `docs/decision-log.md` as its own row, and the debt row to `docs/known-debt.md`. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-120**

- Date: 2026-11-11
- Decision: The break-glass read is `POST /v1/admin/mentorships/{id}/break-glass-read` with a required `reason` of 1 to 1000 characters in the body. A GET with the reason in the query string is rejected.
- Reason: the call writes an audit row, so it is a state change, and a reason in a URL leaks a moderator's free text into access and proxy logs.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `packages/contracts/openapi.yaml`, `docs/api-contracts.md` section 5.5

**D-121**

- Date: 2026-11-11
- Decision: The actor is `PLATFORM_ADMIN` with an enrolled second factor. The order is authorize, validate, resolve, write the audit row, read, respond. A missing or empty reason is `422` with no audit row and no content; a non-admin is `403`; an admin without a second factor is refused before any write; an unknown mentorship is `404` with no audit row; the participant read is unchanged.
- Reason: a moderation read must leave a record before it discloses anything, and each refusal has to be distinguishable from the others in a test.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/auth-and-access-control.md`, `docs/security-requirements.md`

**D-122**

- Date: 2026-11-11
- Decision: The read returns the thread messages oldest first plus the agreement and the session records, using the participant read's own projection. Outcome text, profile text and email addresses are never returned.
- Reason: a reviewer needs the session a report is about, and needs nothing beyond what the requirement authorises.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/api-contracts.md` section 5.5

**D-123**

- Date: 2026-11-11
- Decision: Participants are not notified that their thread was read; the audit row is the record, and a debt row holds the disclosure decision open.
- Reason: notification is the more defensible product long term but `FR-NOT-01` does not list it as a trigger and it needs its own template and its own decision about disclosing moderator activity.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/known-debt.md` (new row)

**D-124**

- Date: 2026-11-11
- Decision: No migration. `audit_logs.action` is plain text and `break_glass` and `reason` already exist, so the audit write is schema-complete; `AuditAction` gains `THREAD_BREAK_GLASS_READ`.
- Reason: a separate reads table would duplicate what the audit log already records, and a column that exists does not need creating.
- Status: Decided
- Affects: `services/api/src/identity/audit-log.ts`, `docs/data-model.md`

**DEBT-52**

- Date: 2026-11-11
- Row: A break-glass thread read is not disclosed to the mentorship's participants: the audit log records the actor, the reason and the mentorship, and nothing tells the student or the mentor that the conversation was read.
- Impact: a participant has no way to learn that a moderator read their private thread, which may matter for the privacy notice and for trust.
- Owner / target: the privacy-notice revision before the pilot, together with `FR-CONS-02` (DEBT-36); the notification would need its own template and its own decision.
- Status: Open

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive on its own `chore/archive-break-glass-thread-read` branch, because the ruleset refuses a direct push to `main`.
- At archive, compare the archived "The thread is participant-only" requirement against the previous text: header identical, three scenario titles identical, only the body changed, and `openspec validate --all --strict` passing with 40 items.
