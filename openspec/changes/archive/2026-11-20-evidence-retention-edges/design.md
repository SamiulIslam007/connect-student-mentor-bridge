# Design: evidence-retention-edges

## Context

**Repository snapshot (verified 2026-11-20 at propose; re-check at apply).**

- `packages/domain/src/evidence-retention.ts` is 27 lines: `RETENTION_TRIGGERS = ["COUNTED", "REJECTED"]`, an input of `{ outcomeStatus, countedAt, rejectedAt, now, windowDays }`, and a doc comment that says "`REVERSED` and `WITHDRAWN` keep their file (D-204)".
- `packages/domain/test/evidence-retention.test.ts` asserts "each of the five non-triggering states is never due, however old" — two of those five assertions now invert, and the file is the place the change is most visible.
- `services/api/src/evidence/retention.ts` — `sweepExpiredEvidence(db, { storage, dryRun, windowDays, batch, now })` returns `{ examined, eligible, deleted, failed, dryRun }`; each file is handled in its own transaction that locks the evidence row and its outcome, re-reads both, deletes the object, marks `deleted_at` and appends one audit row with `requestId: "system:evidence-retention"`.
- `services/api/src/db/schema/outcomes.ts:70-73` — `counted_at`, `rejected_at`, `withdrawn_at`, `reversed_at`, all nullable `timestamptz`. No column is missing, so no migration.
- `services/api/src/db/schema/trust.ts:57-73` — `consent_records(user_id, purpose, action, document_version, institution_id, occurred_at)` with `index("consent_records_user_purpose_idx").on(userId, purpose, occurredAt)`; `consentPurpose` carries `INSTITUTION_DATA_SHARING` and `consentAction` is `GRANTED` or `WITHDRAWN`.
- The student behind an evidence file is `outcomes.student_profile_id` to `student_profiles.user_id`.
- `EVIDENCE_RETENTION_DAYS = 90` and the dry run (`EVIDENCE_RETENTION_DRY_RUN`, exact `false` enables, `D-208`) live in `@connect/config` and the job; this change touches neither.
- `docs/data-privacy-and-retention.md` §6 currently promises "faster if the user withdraws consent", and `DEBT-64` records that nothing implements it.
- `D-204` decided that a reversal or a withdrawal keeps its file. This change reverses that decision, so the log gets a **new superseding row**; `D-204` is not rewritten.

## Goals / Non-Goals

**Goals**

- Four settled states on one clock, each measured from its own transition.
- A consent withdrawal that can advance a file's due date and never delay it.
- The predicate, the selection query and the per-row re-check all agree, and a test proves it.

**Non-Goals**

- No new column, no migration, no backfill, no new environment variable and no new switch.
- No deletion of the row, the hash or the size; no change to the audit action.
- No retention for anything but evidence files.

## Decisions

The owner fixed the four triggers, the "own deciding timestamp" rule, the survivors, the consent-withdrawal clock and the dry-run default. The decisions below are the ones left open.

### R1. Each state's origin is its own instant, not a coalesce across all four

`COUNTED` reads `counted_at`, `REJECTED` reads `rejected_at`, `REVERSED` reads `reversed_at`, `WITHDRAWN` reads `withdrawn_at`. Alternative rejected: `coalesce(counted_at, rejected_at, reversed_at, withdrawn_at)`, which for a clawed-back outcome picks the year-old `counted_at` and deletes the file on the next run — the single worst failure this change could ship.

A settled row whose matching instant is null is never due: a null instant is a projection defect, and the existing predicate already treats it that way for the two states it knows.

### R2. The consent instant can only advance the clock

The origin becomes `min(ownOrigin, consentWithdrawnAt)` when a consent instant exists. Alternative rejected: replacing the origin with the consent instant, which would *delay* a file whose window already started — a withdrawal must never buy more retention.

### R3. The withdrawal that counts is the earliest one, by the reporting student, for institution sharing

The query takes `min(occurred_at)` over `consent_records` with `purpose = 'INSTITUTION_DATA_SHARING'` and `action = 'WITHDRAWN'` for `student_profiles.user_id` of the outcome's reporter. Alternative rejected: the latest withdrawal, which lets a re-grant followed by silence reset the clock, and re-granting cannot un-expose what the first withdrawal priced. Earliest is also monotonic, so no later consent action can delay a due file.

### R4. The query mirrors the predicate and the per-row re-read re-checks it

The selection statement filters on the four statuses, `deleted_at IS NULL`, an object key present, and the computed origin older than the window; the per-row transaction re-reads the row and its outcome and calls the pure predicate before it deletes. Alternative rejected: trusting the query alone, which is how the existing test caught a divergence once already — the test pins the two, and this change adds an assertion per new trigger.

### R5. No migration, and the consent read is a lateral subquery

The consent instant is one indexed lookup per candidate row inside the existing batch bound (100 per run, `D-210`), so no denormalised column is needed. Alternative rejected: stamping a `retention_started_at` on each evidence row, which needs migration `0023` — a number this round has already spent on `idempotency-key-on-writes`, and a write path that has to run on every withdrawal.

### R6. The dry run is untouched

`EVIDENCE_RETENTION_DRY_RUN` keeps its exact-`false` polarity and its default. This change widens *what* is eligible, never *whether* deletion runs, and one test asserts the shipped default still deletes nothing and still reports the new eligible count.

## Acceptance criteria

1. A `REVERSED` outcome whose reversal is older than the window loses its object, keeps its row and gets one audit entry.
2. A `WITHDRAWN` outcome behaves the same on `withdrawn_at`.
3. A `REVERSED` outcome counted a year ago and reversed yesterday keeps its object (not due).
4. A `COUNTED` outcome with an earlier `INSTITUTION_DATA_SHARING` withdrawal is due even though its own window has not elapsed.
5. A withdrawal later than the settle instant does not move the due date.
6. A mentor's own withdrawal does not change the student's file.
7. A settled row with a null matching instant is never due.
8. The dry run reports the new eligible count and deletes nothing, and the audit row shape is unchanged.
9. `packages/domain/test/evidence-retention.test.ts` covers all four triggers and their origins; the two inverted assertions from the old set are rewritten rather than deleted.
10. No migration: `git status --short services/api/drizzle` is empty and the database test still reads thirty-three tables.

## Assumptions

- A student holds at most a handful of settlements, so the correlated consent lookup stays cheap under the batch bound.
- `INSTITUTION_DATA_SHARING` is the only consent purpose that means "share my data outward"; the other four are contractual acceptance and are excluded deliberately.
- A withdrawal that predates the evidence upload still counts — the consent is about the data, not about the file's creation date.

## Risks

The proposal's table covers the substantive risks. The two this design adds:

- The most dangerous regression is R1's coalesce shape; the design forbids it in words and the test suite asserts it with a year-old count and a yesterday reversal, so a reviewer sees the exact failure.
- Widening the trigger set changes what a dry run reports; the operator's first dry-run read after this change will show a larger eligible count, and the runbook's step (`pilot-runbook-and-docs-truth`) already tells them to read one before flipping the switch.
