# Design: evidence-retention-sweeper

## Context

**Repository snapshot (verified 2026-11-15 at propose; re-check at apply).**

- `FR-PRIV-03` is `NOT STARTED` in `docs/functional-requirements.md:258`; `DEBT-32` records "no sweeper deletes evidence files or expires records on a schedule … nothing is deleted automatically".
- `docs/data-privacy-and-retention.md` §6 states the row this implements: "Evidence files | **Deleted 90 days after the outcome is counted**; hash and metadata kept | Proposed default from research 5.7; faster if the user withdraws consent".
- `outcomes` already carries the two instants the predicate needs: `counted_at` and `rejected_at` (`db/schema/outcomes.ts:69-70`), both `timestamptz`, both nullable. `status` is the seven-state enum whose terminal members are `COUNTED`, `REJECTED`, `WITHDRAWN` and `REVERSED`.
- `outcome_evidence.deleted_at` is created by `evidence-upload-and-scan` (this round, migration `0022`) and has no writer until this change.
- The worker registers one queue + one cron per job in `platform/outbox/outbox-worker.ts:66-113`, in the pattern `REQUEST_SWEEP_QUEUE` / `REPUTATION_COUNT_QUEUE` / `ACCOUNT_SANCTION_QUEUE`.
- `AUDIT_ACTION_MAP` is a `Record<AuditAction, true>`, so a union member without a map entry fails the build; `AUDIT_ACTIONS` is derived from the map, and `GET /v1/admin/audit` refuses an action the map does not carry (D-135, D-153).
- Env flags in this repo read one exact value and treat everything else as the safe default: `WEB_CSP_MODE` enforces unless it is exactly `report-only` (D-170), `WEB_CSRF_MODE` guards unless it is exactly `off` (D-161). This change follows the same shape with the polarity reversed.
- `services/api/src/evidence/storage.ts` (from the upload change) declares `delete`; this change is its first caller.

## Goals / Non-Goals

**Goals**

- The retention promise in the privacy document is executed by a job, not asserted by a document.
- The deletion path is fully tested even though the shipped default deletes nothing.
- Every real deletion is attributable and filterable.

**Non-Goals**

- No route, no UI, no report artifact beyond a log line and a returned count.
- No retention for threads, requests, sessions, audit rows or exports.
- No early deletion on consent withdrawal (`DEBT` row instead).
- No restore, no soft-delete window, no second-chance copy.

## Decisions

The owner fixed: the trigger (`COUNTED` or `REJECTED`), 90 days, the survivors, hourly, dry run defaulting to true with a fully tested real path, one `EVIDENCE_RETENTION_DELETED` audit entry in both unions, and consent-withdrawal deletion out of scope with a debt row. The decisions below are the ones left open.

### R1. The clock starts at the terminal instant, not at the upload

`counted_at` for `COUNTED`, `rejected_at` for `REJECTED`. Every other state is ineligible. Alternative rejected: `created_at` of the evidence row, which would delete a document while its outcome is still in review — the one outcome that must keep its evidence.

The predicate is pure and lives in `packages/domain` (`evidenceRetentionDue({ outcomeStatus, countedAt, rejectedAt, now, windowDays })`) so it is testable without a database, in the pattern `responseReliability` set.

### R2. `REVERSED` and `WITHDRAWN` keep their file, and that is stated debt

The brief's trigger list is `COUNTED` or `REJECTED`. A reversal is a compensating ledger row, not an erasure: the material a clawback depends on is exactly the evidence, and deleting it 90 days after the original count would destroy the record a dispute might need. `WITHDRAWN` is the student's own retraction and the file is the only proof the report was ever made. Both are excluded and a debt row records that the policy for them is undecided. Alternative rejected: treating `REVERSED` as terminal for retention, which is a policy decision disguised as an implementation detail.

### R3. The scan status does not gate deletion

A `REJECTED` evidence row (a detection) is deleted on the same clock as a clean one. Alternative rejected: keeping an infected file for 90 days "for analysis", which is a malware-retention policy nobody asked for and a liability; there is no analysis path in the product.

### R4. The object goes first, the row second, and the audit row in the same transaction as the row

Order per file: `storage.delete(key)` → on success, one transaction: `UPDATE outcome_evidence SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, and, if a row came back, one `EVIDENCE_RETENTION_DELETED` audit row with `actorRole: "SYSTEM"` and `requestId: "system:evidence-retention"`. On a delete failure the function logs, writes nothing, and continues with the next file, so the row stays eligible.

Alternative rejected: mark first, delete second, which leaves a row claiming a deletion that may not have happened — an audit log that lies is worse than a job that lags.

### R5. Dry run is the default, and only the exact string `false` turns it off

`retentionDryRun()` reads `EVIDENCE_RETENTION_DRY_RUN` and returns `true` unless the value is exactly `false`. Unset, empty, `FALSE`, `0`, `no` → dry run. This is the mirror of `WEB_CSP_MODE` (D-170): there, one exact value disables a protection; here, one exact value enables a destructive action. A typo must never delete a document.

The sweep function takes `{ dryRun }` as a parameter, so the environment only decides the *job's* default and a test can exercise the real path directly. That is how "the real deletion path must still be fully covered by tests" is satisfied without the shipped default touching a file.

### R6. The dry-run report is a returned count and one log line per run

`sweepExpiredEvidence` returns `{ examined, eligible, deleted, failed, dryRun }`; the job logs it as one JSON line. No table, no route, no page. Alternative rejected: an `evidence_retention_runs` table, which is a second source of truth for a fact the audit rows already carry once a real run happens.

### R7. Batch and cadence

Hourly (`0 * * * *`), batch 100, ordered by the terminal instant ascending so the oldest file goes first and a backlog drains predictably. A batch that fails part-way is not retried as a whole: each file is independent, and the next run re-examines whatever still has `deleted_at IS NULL`.

## Migration and rollback

- **No migration.** `outcome_evidence.deleted_at` exists from `evidence-upload-and-scan`; `outcomes.counted_at` / `rejected_at` exist today; the audit action is a code-level enum.
- **Rollback**: remove the `boss.createQueue` / `schedule` / `work` block for `evidence-retention`; the job stops on the next restart. Rows already deleted stay deleted (deletion is final, by design); rows not yet deleted stay eligible if the feature is restored.
- **Ordering**: must be applied after `evidence-upload-and-scan`. Applied first, the table does not exist and the change cannot compile.

## Risks and what must fail closed

- **Fail closed**: the job must never delete for a non-terminal outcome; never delete twice; never write an audit row without a successful object delete; never leave dry run by accident. Each has a test that fails if the guard is removed.
- The dry-run default is the primary protection. The second is that the operator flips one variable, once, after reading a dry-run count against a real database.
- The retention window is a single constant; a wrong value deletes too much or too little, and the dry run is the rehearsal that makes the value checkable before it bites.
- `FR-PRIV-03` reads `DONE` only when the register also states that the shipped default is dry run, so the claim is honest before the owner flips it.
