# Design: sanction-lifecycle-warn-and-lift

## Context

**Repository snapshot (re-verified 2026-11-13 at apply).**

- Base: `main` after `ui-state-sweep` and `audit-log-search`; `openspec validate --all --strict` passes. No migration: this change adds no table and no column.
- `services/api/src/reports/admin.controller.ts` serves `@Get("reports")` (line 61), `@Post("reports/:id/resolve")` (line 84) and `@Post("admin/accounts/:id/suspend")` (line 113), each behind `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })`.
- `users` (`services/api/src/db/schema/auth.ts`): `status` is the `account_status` enum defaulting to `PENDING` (line 28) and `suspendedUntil` is a nullable timestamptz (line 35). The enum has `PENDING`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, `ANONYMIZED`.
- `audit_logs` has `action` as text, an `object_type`/`object_id` pair and an index on `(object_type, object_id, occurred_at)`.
- `services/api/src/platform/outbox/outbox-worker.ts` registers two cron queues today (`REQUEST_SWEEP_QUEUE`, `REPUTATION_COUNT_QUEUE`) with `boss.work` plus `boss.schedule`, and one relay worker; the pattern for a third is one import, one `work`, one `schedule`.
- Templates are string keys on the outbox payload; the suspended notice is `account-suspended`.
- `apps/web/app/admin/reports/page.tsx` already renders a suspend form with a reason and an optional end date, and it is the page a moderator works from.

## Goals / Non-Goals

**Goals**

- A sanction that can be undone by a route, not by SQL.
- A warning that is on the record and changes nothing about the account.
- An end date that actually ends, bounded and idempotent.

**Non-Goals**

- No removal, no appeal, no expiring warning, no user-initiated reinstatement.
- No new table and no migration.

## Decisions

The brief fixed the two routes and the "stored warning count"; decisions taken here carry `R` numbers.

### R1. The warning count is derived from audit rows, not a column

`warning_count` is a grouped count over `audit_logs` where `action = 'ACCOUNT_WARNED'` and `object_id` is the account id. It is stored by construction (append-only), cannot drift from its own history, and needs no migration. Alternative rejected: a `users.warning_count` column, which is a second source of truth for a number that history already holds, and which a rollback would have to un-add.

### R2. One service method per transition, shared by the route and the job

`liftSuspension({ accountId, actorUserId, reason, source })` performs the conditional update, the audit row and the queued notice. The route passes the admin's id and reason; the job passes the job's own actor and a reason naming the passed end date. Alternative rejected: two implementations, which is how a route and a job drift until one of them skips the notice.

### R3. The lift is one conditional update, not a read-then-write

One conditional `UPDATE users` per path, whose `WHERE` clause requires the row to be `SUSPENDED` and, for the job, its stored end date to be set and at or before the current instant, with `RETURNING id`. A zero-row result is `409 ACCOUNT_NOT_SUSPENDED` on the route and a no-op in the job. Alternative rejected: a read followed by a separate write, which loses to a concurrent suspension.

### R4. The route may lift a suspension with no end date; the job may not

An admin lifts any `SUSPENDED` account with a reason; the job only lifts a row whose stored end date has passed. A permanent suspension is therefore permanent by its empty date, and no job can end it. Alternative rejected: letting the job lift any suspension after a fixed period, which would silently expire an indefinite sanction.

### R5. The expiry job is its own queue, every fifteen minutes

`ACCOUNT_SANCTION_QUEUE` with a `*/15 * * * *` schedule, batch bounded at 50 rows per run, each row handled in its own transaction so one bad row cannot stall the batch. Alternative rejected: folding it into `requests-sweeper`, which runs every five minutes and owns a different aggregate; a shared handler makes both harder to reason about and to test.

### R6. A warning's notice names the reason and no reporter

The `account-warned` template carries the reason text only, mirroring `account-suspended`. Alternative rejected: naming the report or the reporter, which the existing suspension requirement already forbids and which a warning has no more right to.

### R7. The web controls sit beside the suspend control on the report page

Warn and reinstate are two buttons on the same row disclosure the suspend form uses, and the row shows the account's warning count. Alternative rejected: a new account-management page, which is a surface this change does not need and which would duplicate the row context the moderator already has.

### Apply-time corrections

- **The warning count needs no column and no migration** (confirmed): it is one grouped count over `ACCOUNT_WARNED` audit rows, computed on the queue read.
- **A lift needs a new error code**: `ACCOUNT_NOT_SUSPENDED` was added to `IdentityErrorCode` and to `ProblemDetailsFilter` as `409`, because no existing code said "this account is not suspended".
- **The count is only meaningful for an account target**: the queue exposes `warning_count` for a report whose `target_kind` is `user` and leaves it `0` otherwise, because a message, profile or outcome report does not name one account on its own.
- **The web controls sit in the existing suspension section**, beside the suspend button, and reuse its account-id and reason inputs; a per-row control would need an account id the other target kinds do not carry. The row shows the count for a reported account.

## Assumptions

1. `suspended_until` is the only end-date source and is set only by the suspend route; nothing else writes it.
2. The job runs in the worker process, which already holds the database pool and the outbox queue; no new process is needed.
3. A reinstated account signs in again with its own password; no session is created by the lift, because every session was revoked at suspension and creating one would be a security hole.
4. The pilot has one moderator, so there is no second-operator check on a lift; `SEC-AC-6` is unaffected by this change and is a process rule.

## Acceptance criteria

1. A warning appends one `ACCOUNT_WARNED` row, queues one `account-warned` notice and leaves `users.status` and `users.suspended_until` unchanged.
2. Reinstating a `SUSPENDED` account sets `ACTIVE`, clears the end date, appends one `ACCOUNT_REINSTATED` row and queues one notice, in one transaction.
3. Reinstating an `ACTIVE` account is `409 ACCOUNT_NOT_SUSPENDED` and writes nothing.
4. The job lifts only rows whose end date has passed; a null end date is untouched, asserted by running the job twice.
5. The audit row's actor is the admin on the route path and the job identity on the job path; a test asserts both.
6. `grep -rn "ACCOUNT_WARNED" services/api/src` finds the action in the union, the service and the queue count.

## Risks

- Adding an injected dependency to `ReportsAdminController` breaks every test that hand-builds its provider list; the tasks grep for the class name in the test tree before running the suite.
- The new scheduled queue must be registered in the worker entry point as well as the module, or it silently never runs; a task asserts the registration with a grep and a live worker start.
