# Design: audit-sampling

## Context

**Repository snapshot (verified 2026-11-15 at propose; re-check at apply).**

- Base: `main` at `c3996dd`, tree carries only the untracked audit report. Zero active changes before this round.
- `OutcomeService.hold` exists and is unused: `services/api/src/outcomes/outcome.service.ts:53` (`/** The audit hold (T6). No route calls it yet: FR-ADM-03 is the first caller. */`) and `:126-127`. Its implementation (`drizzle-outcome.service.ts:584-640`) runs one transaction: read the row `for update`, `transition(status, "auditHold")` (which returns a target only from `CONFIRMED`), a conditional `UPDATE … WHERE status = current`, one `CASE_OPENED` event carrying `{ reason }`, one `OUTCOME_AUDIT_HELD` audit row, and no email.
- `transition("CONFIRMED","auditHold")` returns `IN_PLATFORM_REVIEW`; the property test walks 49 pairs. `countDueOutcomes` selects `status = 'CONFIRMED'` rows whose `cooling_ends_at <= now`, so a held row is invisible to counting without any change.
- `OUTCOME_AUDIT_HELD` is already in the writer union (`services/api/src/identity/audit-log.ts` `AuditAction`) and in the reader map (`services/api/src/audit/audit.service.ts:40`), so the action a hold writes is filterable today.
- The review queue derives its kind in SQL: `COALESCE((SELECT record.kind FROM verification_records … WHERE kind IN ('MENTOR_DISPUTE','CONFLICT_OF_INTEREST') ORDER BY created_at DESC LIMIT 1), 'ESCALATED_D7')` (`drizzle-outcome.service.ts:834-839`). A hold writes **no** verification record, so a held case currently reports `escalated_d7`. That is the defect this change fixes in the same statement.
- The queue route is `GET /v1/review-queue` (`review-queue.controller.ts`), `PLATFORM_ADMIN` + `requiresMfa`, keyset on `(mentor_decision_due_at, id)`, `limit` 1..50. It takes `cursor` and `limit` only.
- The worker registers one queue and one cron per job in `services/api/src/platform/outbox/outbox-worker.ts:66-113`, with the queue name and cron exported from the job's own module (the pattern `REQUEST_SWEEP_QUEUE`, `REPUTATION_COUNT_QUEUE`, `ACCOUNT_SANCTION_QUEUE`).
- `packages/domain` has no import at all (16 pure modules, no `node:crypto`), so the draw cannot use a hash library without breaking the purity boundary the ESLint config enforces.
- Config constants live in `packages/config/src/index.ts` (9 exports, including `REPUTATION_DIFFICULTY_WEIGHTS`, `OUTCOME_COOLING_PERIOD_DAYS`).

## Goals / Non-Goals

**Goals**

- `FR-ADM-03`'s first two clauses become real: random sampling at a configured rate, and every high-difficulty outcome at 100%.
- The job is safe to run every 15 minutes forever: deterministic, idempotent, bounded, and it cannot touch a counted outcome.
- A reviewer can tell a sampled case from a dispute without opening it.

**Non-Goals**

- No anomaly trigger, no new case object, no assignment, no SLA, no appeal.
- No UI change: `/admin/reviews` already renders the queue and gains no control.
- No migration and no new table.
- No change to the rate's *source* — that is `configuration-versioning`'s job.

## Decisions

The owner fixed the rate, the always-sampled set, the absence of anomaly triggers, the deterministic-hash idempotency, the 15-minute queue, the query filter, and the audit-union duty. The decisions below are the ones left open.

### R1. The draw is an FNV-1a hash over the outcome id and a fixed salt, in `@connect/domain`

`shouldSample({ outcomeId, outcomeType })` returns `"ALWAYS" | "SAMPLED" | "SKIPPED"`. It hashes `"audit-sample-v1:" + outcomeId` with FNV-1a (32-bit), divides by `2^32`, and compares to `AUDIT_SAMPLE_RATE`. Alternative rejected: `node:crypto`'s SHA-256, which would either import a Node built-in into `packages/domain` (breaking the purity boundary the ESLint config enforces) or push the rule into the API layer where it cannot be unit-tested without a database. FNV is not cryptographically strong, and it does not need to be: outcome ids are server-generated UUIDs, a client cannot choose one, and knowing the answer gains nothing because the selected outcome is held for review either way.

The salt is a constant, not the config version, so raising the rate later cannot re-roll outcomes that were already judged. When `configuration-versioning` lands, the salt string stays and the *rate* becomes the versioned value.

### R2. The always-sampled set is a fixed list of three outcome types, not a weight comparison

`AUDIT_ALWAYS_SAMPLED_OUTCOME_TYPES = ["ADMISSION", "INTERNSHIP", "JOB_OFFER"]`. Alternative rejected: "the highest configured difficulty band", which with every weight at `1.0` selects every outcome and makes the random draw meaningless. The three types are the ones the register already says need Tier 1 (`FR-OUT-07`), so the rule has a documentary basis rather than a invented one.

### R3. The job selects, the service holds, and nothing else is written

`sampleConfirmedOutcomes(db, { actorRole: "SYSTEM", requestId: "system:audit-sampler" })`:
1. one bounded select of `CONFIRMED` outcomes with `cooling_ends_at > now()` (batch size 50, ordered by `cooling_ends_at, id`, `for update skip locked` is **not** needed because `hold` locks its own row);
2. for each, `shouldSample`;
3. for each selected id, `OutcomeService.hold({ outcomeId, reason, actorUserId: null, actorRole: "SYSTEM", requestId })`.

`hold`'s current signature takes `actorUserId: string`; it must widen to `string | null` so a system actor can be recorded, in the pattern `drizzle-reports.service.ts:370` already uses (`input.actorUserId === null ? "SYSTEM" : "PLATFORM_ADMIN"`). That is a one-line widening in `outcome.service.ts`, the interface and `appendAuditEntry`'s caller, and it is the only signature change in this proposal.

The reason string is `AUDIT_SAMPLE` for a random selection and `HIGH_DIFFICULTY` for an always-sampled type; it is stored in the existing `CASE_OPENED` payload, so the reviewer sees why the case exists without a new column.

### R4. A job-level failure is contained per outcome

Each hold runs in its own transaction, and the loop catches a `409 OUTCOME_INVALID_STATE` (another actor decided or counted the outcome between the select and the hold) and continues. Any other error propagates so pg-boss records the failure and the row stays visible. Alternative rejected: one transaction around the whole batch, which would roll back every hold because one outcome raced.

### R5. The queue's case kind gains an explicit `AUDIT_HOLD` branch, and the filter reuses it

The derived kind becomes:

```
COALESCE(
  (SELECT kind FROM verification_records … LIMIT 1),
  (SELECT 'AUDIT_HOLD' FROM outcome_events e
     WHERE e.outcome_id = outcomes.id AND e.event_type = 'CASE_OPENED' LIMIT 1),
  'ESCALATED_D7'
)
```

`CASE_OPENED` is written only by `hold` (the dispute path writes `DISPUTED` / `COI_DECLARED`, escalation writes `ESCALATED_D7`), so the branch is exact and needs no new column. The filter compares the same expression, lowered, against the four values; an unknown value is `422` in the controller, not a silent empty page — the rule D-135 set for the audit log's action filter.

No migration. Alternative rejected: a `case_kind` column on `outcomes`, which would be a second source of truth for a fact the events already carry.

### R6. No audit action is added, and the parity is asserted

`OUTCOME_AUDIT_HELD` already exists in both unions. Adding `OUTCOME_AUDIT_SAMPLED` would put two rows on one fact and break the "one row per fact" rule `audit-action-call-sites` established (D-151..153); D-168 rejected exactly this shape for the request-expiry path. The change adds a test that filters `GET /v1/admin/audit` by `OUTCOME_AUDIT_HELD` and asserts a `200` with the row, which is the property the union rule protects.

### R7. The rate is read through one seam

The job calls `auditSampleRate()` from `@connect/config` (a one-line function returning the constant). `configuration-versioning` replaces that function's body with a read of the active version and touches no job logic. Alternative rejected: reading a config row directly here, which would mean writing the config table twice in one round.

## Migration and rollback

- **No migration.** The hold's state, event type and audit action all exist; the queue filter is derived at read time.
- **Rollback**: delete the `boss.createQueue` + `boss.schedule` + `boss.work` block for `audit-sampler` from `outbox-worker.ts`. Sampling stops on the next restart. Cases already held remain `IN_PLATFORM_REVIEW` and are resolved by the existing review route; no reputation row was written for them, so nothing needs unwinding.
- **Ordering**: this change must be applied before `configuration-versioning`, which puts the rate inside version 1's payload; the reverse order makes the job read a version that does not exist yet.

## Risks and what must fail closed

- **Fail closed**: the job must never call `hold` for an outcome that is not `CONFIRMED` (the service refuses with `409`, and the test proves it); it must never write a reputation row; and it must never mark an outcome as sampled without the hold committing. If the hold throws, the outcome stays `CONFIRMED` and will be re-evaluated next run.
- The batch bound is 50 per run with a 15-minute cadence; a backlog of held-but-undecided cases grows the review queue rather than the job's runtime.
- The reviewer capacity is the real constraint: at 25% plus 100% of three types, a week of 20 confirmations produces roughly 5 to 8 cases for the only reviewer. Both values are single constants, and the decision log records the working assumption.
