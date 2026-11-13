# Proposal: sanction-lifecycle-warn-and-lift

## Why

`FR-ADM-05` is Must and says "warn, suspend, remove, with reason and end date". Only suspension exists, and it is one-way: the end date is stored, shown, audited and mailed, and then nothing happens — `DEBT-40` says plainly that "a suspension set by mistake, or one whose end date has passed, keeps the account locked out until someone edits the row by hand; the notice email says so". A pilot moderator with one admin has no safe sanction: every suspension is permanent until SQL.

## What Changes

- Add `POST /v1/admin/accounts/{id}/warn` with a required reason: one `ACCOUNT_WARNED` audit row, one notice email, **no status change**. The warning count is derived from the audit rows, so a repeat warning accumulates without a new table.
- Add `POST /v1/admin/accounts/{id}/reinstate` with a required reason: `SUSPENDED` becomes `ACTIVE` only while the row is still `SUSPENDED`, with one `ACCOUNT_REINSTATED` audit row and one notice email, in one transaction.
- Add a scheduled job that lifts a suspension whose `suspended_until` has passed, using the same conditional update and the same audit and notice path, bounded per run and idempotent.
- Surface both actions on `/admin/reports` beside the existing suspend control, and show the warning count for the reported account.
- Amend `FR-ADM-05` to "warn, suspend, lift", with removal recorded as out of MVP.
- Close `DEBT-40`. Two new email templates, three new audit actions, two new routes, one new scheduled queue. No migration: `users.suspended_until` and the audit table already exist.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trust/abuse-reports-and-sanctions`: three requirements are added — a warning that changes no status, a reinstate route, and a scheduled lift — over the existing suspension requirement, which is unchanged.

## Impact

- **Code**: `services/api/src/reports/admin.controller.ts` (two routes) and `services/api/src/reports/` (the sanction service methods; `drizzle-reports.service.ts` grows the conditional updates), `services/api/src/identity/audit-log.ts` (three actions), `services/api/src/platform/outbox/outbox-worker.ts` (one new scheduled queue), `services/api/src/reports/sanction-expiry.ts` (new job), `services/api/src/platform/outbox/templates.ts` (two templates if templates live there), `apps/web/app/admin/reports/page.tsx` (two controls and the warning count), two BFF routes under `apps/web/app/api/admin/accounts/[id]/`, `apps/web/lib/reports.ts`, `apps/web/lib/strings.ts`.
- **Tests**: new `services/api/test/sanctions.integration.test.ts`; edited `services/api/test/authorization-matrix.test.ts` and `request-validation.integration.test.ts` (two routes each), `services/api/test/outbox.integration.test.ts` (the new templates), `apps/web/test/report-control.test.ts` (the new controls).
- **API/contract**: two paths and their body keys (`reason`) in `packages/contracts/openapi.yaml` and `body-keys.ts`; the report-queue entry gains one integer `warning_count`.
- **Data**: none. `users.suspended_until` exists; warnings are counted from `audit_logs`, which is append-only and already indexed by object.
- **Docs**: `docs/functional-requirements.md` (`FR-ADM-05` built as narrowed), `docs/known-debt.md` (`DEBT-40` closed), `docs/api-contracts.md`, `docs/auth-and-access-control.md`, `docs/data-model.md` (warnings are derived, said so), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `abuse-reports-and-sanctions` (archived 2026-11-10): the suspension route, its transaction shape and its notice template.
- `platform/outbox-and-job-runner` (archived 2026-11-08): the queue and its scheduled-worker pattern.
- `identity/role-authorization` (archived 2026-11-05): `requireRole` with `requiresMfa`.

## Out of scope

- Removal (`remove`): out of the MVP by decision; the register row is amended to say so.
- An appeals flow, a warning that expires, and a warning shown to the warned user beyond the notice email.
- Reinstating an `ANONYMIZED`, `DELETION_PENDING` or `DEACTIVATED` account: the job and the route touch `SUSPENDED` only.
- A reinstatement request flow a user can start.
- Lifting a suspension in the same transaction as a report resolution.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The job lifts a suspension the admin intended to be permanent | It only touches rows whose `suspended_until` is not null and is in the past, and the admin who wants permanence leaves the date empty; a test asserts a null end date is never lifted |
| The job races a fresh suspension | The update is conditional on `status = SUSPENDED` **and** the same stored end date the job read; a lost race changes nothing and the next run sees the new date |
| A lift resurrects an account that was suspended for a breach | The audit row names the job as the actor and the notice states the end date that passed; the admin can suspend again, and the change does not touch `ANONYMIZED` or `DEACTIVATED` rows |
| The job and the route diverge | Both call one service method; the test asserts the same audit action and the same template from each path |
| A warning count query on every queue page load is slow | One grouped count over `audit_logs` for the page's account ids, not one query per row; the index on `(object_type, object_id, occurred_at)` covers it |

Rollback: delete the two routes, the job and its queue registration, and the two controls. Audit rows written before a rollback stay as history, which is correct: they record sanctions that really happened.

**Traces to** FR-ADM-05 (as amended), FR-AUTH-10 (suspension revokes sessions, unchanged), FR-NOT-01 (two new triggers); SEC-AC-6 (no shared admin accounts); D-88 (suspend only, lifted by this change), DEBT-40 (closed).
