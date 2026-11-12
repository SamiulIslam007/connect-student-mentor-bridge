# Proposal: break-glass-thread-read

## Why

`FR-THR-03` is Must and half built. It requires that "a Platform Admin can read only through audited break-glass access with a stated reason", and `DEBT-30` records the gap: "no admin route reads a mentorship thread ... A moderator cannot read the conversation a report refers to, so moderation relies on what the reporter quotes."

That is a live hole in the moderation loop, not a nice-to-have. `trust/abuse-reports-and-sanctions` shipped a report queue whose targets include a message (`POST /v1/reports` accepts a message the reporter can see, and `GET /v1/reports` returns the queue with `target_kind` and `target_id`), and the resolution route asks a reviewer to write a reasoned decision about a conversation they cannot open. The reviewer's only inputs today are the reporter's own words and the reported message id.

Everything needed is already in place. `audit_logs` carries `break_glass` and `reason` columns (`services/api/src/db/schema/trust.ts` line 88 and 89), its `action` column is plain text, and the participant thread read already returns the projection this route needs. So the change is one guarded route, one audit write ahead of the content, and one action in the existing admin page.

## What Changes

- Add `POST /v1/admin/mentorships/{id}/break-glass-read`, available to `PLATFORM_ADMIN` with an enrolled second factor, with a required `reason` of at most 1000 characters in the body. It is a POST because it writes an audit row and because a reason in a URL would land in access logs (D-120).
- Write one `audit_logs` row with `break_glass` true, the reason, the actor and the mentorship id **before** any content is returned. A missing or empty reason is `422` with no audit row and no content; a non-admin is `403`; an admin without a second factor is refused; an unknown mentorship is `404` with no audit row (D-121).
- Return the thread messages oldest first plus the agreement and the session records of that mentorship, using the same projection as the participant read, so there is one shape rather than two. No outcome text (D-122).
- Add `THREAD_BREAK_GLASS_READ` to `AuditAction` in `services/api/src/identity/audit-log.ts`.
- Add a "Read thread" action to `apps/web/app/admin/reports/page.tsx` for queue entries whose target is a message, with a required reason input, plus its BFF route.
- Add one nullable field to the report-queue projection so the admin page knows which mentorship a message target belongs to (R1); without it the page cannot form the route.
- Add the four registry entries, the contract paths and the body key.
- Register the routes in all four hand-maintained registries; add two requirements to `mentorship/thread-and-sessions` and modify the participant-only requirement.
- Close `DEBT-30`; record one debt row for participant disclosure (D-123).
- No migration: the audit columns and the text action column already exist (D-124).

## Capabilities

### New Capabilities

None. Both the thread and its access rule belong to `mentorship/thread-and-sessions`.

### Modified Capabilities

- `mentorship/thread-and-sessions`: the requirement "The thread is participant-only" is restated so the participant route keeps its `404` for everyone else while the audited break-glass read becomes the single, named exception; one requirement is added for the break-glass read itself.

## Impact

- **Code**: `services/api/src/mentorships/admin-thread.controller.ts` (new, following the `ReportsAdminController` split), `services/api/src/mentorships/mentorship.service.ts` and `drizzle-mentorship.service.ts` (one read reuse), `services/api/src/mentorships/mentorships.module.ts`, `services/api/src/identity/audit-log.ts` (one action), `services/api/src/reports/drizzle-reports.service.ts` (one nullable field on the queue projection), `apps/web/app/admin/reports/page.tsx`, `apps/web/app/api/admin/mentorships/break-glass/route.ts` (new), `apps/web/lib/reports.ts`, `apps/web/lib/strings.ts`.
- **Tests**: new `services/api/test/break-glass.integration.test.ts`; edited `services/api/test/authorization-matrix.test.ts` (one MATRIX row plus the controller and provider lists), `services/api/test/request-validation.integration.test.ts` (controller and provider lists), `services/api/test/reports.integration.test.ts` (the queue projection key set), `apps/web/test/report-control.test.ts` or a new page test for the action.
- **API/contract**: `packages/contracts/openapi.yaml` gains one path and one schema; the report-queue entry schema gains one nullable property; `packages/contracts/src/body-keys.ts` gains `POST /v1/admin/mentorships/:id/break-glass-read` with `reason`.
- **Data**: none. No table, column, enum or migration.
- **Dependencies**: none added.
- **Docs**: `docs/api-contracts.md` section 5.5 (the route) and section 5.9 (the queue field), `docs/auth-and-access-control.md` (break-glass, its reason and its audit), `docs/functional-requirements.md` (`FR-ADM-06` and `FR-THR-03` built), `docs/security-requirements.md` (the break-glass rule), `docs/known-debt.md` (`DEBT-30` closed, one row opened), `docs/decision-log.md` (D-120 to D-124), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line.

## Depends on

- `mentorship/thread-and-sessions` (archived 2026-11-08): the mentorship row, the participant thread read, the agreement and the session records.
- `trust/abuse-reports-and-sanctions` (archived 2026-11-10): the report queue this action is reached from, and the admin-write pattern.
- `identity/role-authorization` (archived 2026-11-05): `requireRole` with `requiresMfa`.
- `trust/consent-and-audit-records` (archived 2026-11-10): the append-only audit log and its `break_glass` and `reason` columns.

## Out of scope

- Evidence-file access (`DEBT-22`: no evidence file exists).
- Write access of any kind: an admin reads, never posts.
- Thread search, export, or a bulk read across mentorships.
- Participant notification that their thread was read (D-123).
- An appeals or second-reviewer flow over a break-glass read.
- Break-glass access to anything other than a mentorship (profiles, outcomes, exports).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The route becomes a quiet back door into private conversations | It requires `PLATFORM_ADMIN` plus an enrolled second factor, a stated reason, and one audit row written before any content is returned; the test asserts the audit row exists when content is returned and does not exist when the call is refused |
| A wider read than the requirement allows | The projection is the participant read's own, plus the agreement and sessions; outcome text and profile text are never included, and the payload test freezes the key set |
| The audit write and the read diverge | The audit row is written first, so a read that fails afterwards leaves a record of the attempt rather than an unrecorded read |
| The admin page offers the action where no thread exists | The action renders only for entries whose target is a message and whose mentorship id is known; the route answers `404` regardless |
| A cached response leaks a thread to a later caller | The response sets `Cache-Control: no-store` |
| A security-rule change reviewed by the same context that wrote it | The tasks require an independent second review pass over the diff against the trust rules |

Rollback: delete the controller, the BFF route and the page action; revert the contract, the body key, the MATRIX row, the queue field and the audit action. Audit rows written before a rollback stay as history, which is correct: they record reads that really happened.

**Traces to** FR-ADM-06 (break-glass access, logged with a reason), FR-THR-03 (thread access limited to participants, admin only through audited break-glass), FR-ADM-04 (the moderation queue this serves), FR-AUD-01 (audit of break-glass access), FR-PROF-04 (no profile text is disclosed); ADR-008 (append-only audit); D-120 to D-124 (this change); DEBT-30 (closed), DEBT-22 (untouched).
