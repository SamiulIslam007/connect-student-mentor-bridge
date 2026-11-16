# Proposal: evidence-retention-sweeper

## Why

`FR-PRIV-03` is a Must and it is `NOT STARTED`: "evidence files deleted a set time after an outcome counts or is rejected; only its hash and metadata remain". `docs/data-privacy-and-retention.md` §6 states the period (90 days after the outcome is counted) and the survivors (hash and metadata), and `DEBT-32` records that nothing sweeps. Until `evidence-upload-and-scan` lands there is nothing to sweep; once it lands, every uploaded document is kept forever unless a job deletes it. A retention promise with no job behind it is a privacy-notice claim the system does not keep.

## What Changes

- One scheduled job (`evidence-retention`, hourly) that deletes the stored object for every evidence file whose outcome reached `COUNTED` or `REJECTED` more than 90 days ago, and keeps the metadata row, its SHA-256 and a `deleted_at` instant.
- The threshold is a config constant read through one seam, so `configuration-versioning` can move it into a version's payload later without touching the job.
- A dry-run mode that **defaults to on**: the job reports what it would delete and deletes nothing until the operator sets the variable to exactly `false`. A typo, an empty value or an unset variable all keep the job in dry run — the inverse of a kill switch, deliberately.
- One audit action, `EVIDENCE_RETENTION_DELETED`, added to the writer union **and** the reader map, written once per file actually deleted (never in dry run).
- One debt row for the out-of-scope half: deleting a file early when a consent is withdrawn.

## Capabilities

### New Capabilities

- `trust/evidence-retention`: the sweep predicate, the survivors, the dry-run default and the audit row.

### Modified Capabilities

None. `trust/privacy-export-and-erasure` describes deletion of an *account*, not of a file on a retention clock; the two touch different rows and neither contradicts the other.

## Impact

- **Code**: `services/api/src/evidence/retention.ts` (the pure predicate plus the sweep), `services/api/src/platform/outbox/outbox-worker.ts` (one queue, one cron), `packages/config/src/index.ts` (`EVIDENCE_RETENTION_DAYS = 90` and the named helper), `services/api/src/evidence/storage.ts` (`delete` — declared by the upload change, first used here), `services/api/src/identity/audit-log.ts` + `services/api/src/audit/audit.service.ts` (`EVIDENCE_RETENTION_DELETED`).
- **Contract**: none. No route is added or changed; the audit action becomes filterable through the existing parity rule.
- **Data**: none. `outcome_evidence.deleted_at` is created by `evidence-upload-and-scan`; this change is its first writer. No migration.
- **Tests**: `packages/domain/test/evidence-retention.test.ts` (the predicate: before, at, and after the boundary; a live outcome; a reversed or withdrawn one), `services/api/test/evidence.integration.test.ts` (the sweep deletes the object and keeps the row; dry run deletes nothing; a second run is a no-op; one audit row per deletion; a store error leaves the row intact and the job retries).
- **Docs**: `docs/data-privacy-and-retention.md` §6 (the job exists, the dry-run default, the survivors), `docs/functional-requirements.md` (`FR-PRIV-03` to `DONE`), `docs/data-model.md` (`deleted_at` becomes live and its meaning is stated), `docs/known-debt.md` (close `DEBT-32`, open the consent-withdrawal row), `docs/local-setup.md` (the variable name and the dry-run default), `.env.example` (name only), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

- `evidence-upload-and-scan` (this round): the table, the `deleted_at` column, the storage `delete` and the object keys. Applied first.

## Out of scope

- Deleting a file early when a consent is withdrawn (`docs/data-privacy-and-retention.md`'s "faster if the user withdraws consent"). It needs a consent-to-file link that does not exist and a decision on whether a withdrawal may destroy evidence a counted outcome rests on. Recorded as debt, not invented.
- Retention for anything else: threads, requests, sessions, audit rows, exports, dispute notes. Each has its own period in §6 and none has a job; a single change that swept all of them would be six changes.
- An admin route to trigger a sweep, a per-run report page, or a scheduler UI.
- Restoring a deleted file. Deletion is final by design.
- Any change to the account-deletion path (`FR-PRIV-02`), which already tombstones identifiers and never touches ledger rows.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The job deletes a file for an outcome that is still live, or one a dispute still needs | The predicate requires a terminal `COUNTED` or `REJECTED` state **and** a terminal instant older than the window; `QUARANTINED`, `CLEAN`-but-unresolved, `PENDING_CONFIRMATION`, `CONFIRMED`, `IN_PLATFORM_REVIEW`, `WITHDRAWN` and `REVERSED` files are never touched |
| A typo in the flag turns real deletion on | Only the exact string `false` enables deletion; unset, empty, `FALSE`, `0` and any other value keep dry run. The owner flips it deliberately, once, after reading a dry-run report |
| A storage failure leaves a row marked deleted while the object survives | The object delete is attempted first and the row is only updated on success; a failure is caught, logged, and the row stays eligible for the next run |
| A retried run deletes twice or audits twice | The row's `deleted_at IS NULL` predicate and the update's `RETURNING` guard make the second attempt a no-op, and the audit row is written in the same transaction as the update |
| The window is wrong (too short for a dispute, too long for the notice) | It is a single named constant, the dry-run report shows exactly what would go, and the value is the one the privacy document already states (90 days) |

Rollback: remove the queue registration and the job stops. Nothing is restored, because deletion is final; a row with `deleted_at` still carries its SHA-256, so the ledger and the outcome can still be audited. If the feature is withdrawn before any real run, removing the registration leaves the system exactly as `evidence-upload-and-scan` left it.

## Decisions taken here

Two things the brief left open, decided in `design.md`. **(1)** An outcome that is `REVERSED` or `WITHDRAWN` keeps its file: a clawback or a dispute is exactly when the material matters, and the brief's trigger list is `COUNTED` or `REJECTED` only. The consequence is recorded in the debt row, not silently accepted. **(2)** The scan status does not gate deletion: a `REJECTED` (infected) file is deleted on the same clock, because keeping known malware for 90 days is worse than deleting it. Both are stated in the design's risks so a reviewer can disagree with them explicitly.
