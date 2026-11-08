# Design: outcomes-and-verification

## Repository snapshot (verified 2026-11-08, re-check at apply)

- `docs/data-model.md:222-275` is the authoritative seven-state machine and the T1–T11 transition table; `docs/api-contracts.md:348-384` mirrors it. This design implements that text; where the two differ, the data model wins.
- `services/api/src/db/schema/trust.ts` shows the append-only table comment style and the existing `consent_records` / `audit_logs` grant treatment; `services/api/src/db/schema/enums.ts` has no outcome enum yet.
- `services/api/src/identity/audit-log.ts` exports `appendAuditEntry(database, entry)` and a closed `AuditAction` union (20 values, `PROVIDER_SIGN_IN` last). `audit_logs.action` is `text`, so a new action needs no migration.
- `services/api/src/requests/request-sweeper.ts` (129 lines) is the sweeper pattern: bounded select, conditional update, one outbox enqueue per row.
- `services/api/src/requests/drizzle-requests.service.ts:399-493` shows the participant-resolution + conditional-update + outbox style this module copies.
- `packages/config/src/index.ts` is 11 lines and exports three constants; it is the single source for cross-package values.
- `packages/contracts/openapi.yaml` has no outcome path today; `packages/domain/src/index.ts` re-exports each rule module explicitly, so a new rule file must be added there.
- Gates on 2026-11-08: `pnpm lint` exit 0, `pnpm typecheck` exit 0. `pnpm test` was NOT run in this pass.
- `services/api/test/database.integration.test.ts:47` asserts a fixed table list and count (Change 1 already raises it to twenty-three); `services/api/test/authorization-matrix.test.ts` requires one MATRIX row per registered route.

## Goals / Non-Goals

**Goals**

- Make every outcome transition legal-or-refused by one pure function, with the event ledger as the record.
- Make `OUT-Q1` executable before any counting code exists.
- Keep the mentor's decision cheap: confirm with a contribution level, or dispute with a reason.

**Non-Goals**

- Counting, cooling jobs, reputation, and snapshot writes.
- Reviewer routing, case assignment, and written-reason decisions.
- Any evidence artifact or file storage path.

## Decisions

**D1 — `outcomes.status` is a projection written in the same transaction as the event.** Every transition inserts one `outcome_events` row and then updates the projection columns in that transaction. Rejected: deriving status from the latest event on every read. Deriving would expose a race between two concurrent decisions and force every list query into a window function, while the projection is what the API and the sweeper both index.

**D2 — `seq` is allocated under a row lock on the outcome.** The service locks the outcome row, reads `max(seq)`, writes `seq + 1`, and a unique index on (`outcome_id`, `seq`) is the backstop. Rejected: a database sequence per outcome (one sequence per row is not expressible) and a gap-tolerant `created_at` ordering (the data model requires gap-free).

**D3 — `verification_records` carries the dispute reason and the conflict declaration.** No `disputes` table in this change. The record's `kind` distinguishes `MENTOR_CONFIRMATION`, `MENTOR_DISPUTE`, and `CONFLICT_OF_INTEREST`, and `coi_declaration` is `jsonb`. Rejected: creating the case table now — it has no reader until the review queue, and its shape (`OPEN`/`IN_REVIEW`/`RESOLVED`, assignment) is the review queue's problem.

**D4 — The cooling period lives in `@connect/config` as `OUTCOME_COOLING_PERIOD_DAYS = 14`, labelled a Proposed default.** It is written into `cooling_ends_at` at confirmation and read by nothing else in this change. `docs/api-contracts.md:549` (API-O7) records that the value is not decided, so the constant carries the same label and an open question names the owner decision. Rejected: putting it in the environment — it is a policy number, not deployment configuration.

**D5 — `earnsMentorReputation(outcome)` ships with no consumer.** The predicate returns true only for a counted outcome whose basis is a mentor confirmation with no declared conflict. It is a deliberate, owner-requested exception to the repo's "no policy without a consumer" rule (D-47), because `OUT-Q1` has to be executable before `reputation-ledger-and-counting` can write a single event. It is exercised by unit tests and reported as inert in the docs.

**D6 — Timer deduplication uses partial unique indexes on the event table, not columns on `outcomes`.** Unique (`outcome_id`, `event_type`) `WHERE event_type IN ('REMINDER_D3_SENT','REMINDER_D5_SENT','ESCALATED_D7')`. Rejected: three nullable timestamp columns — they duplicate what the ledger already records and would need their own backfill if a timer is ever re-run.

**D7 — Audit actions are outcome-specific.** The `AuditAction` union gains `OUTCOME_REPORTED`, `OUTCOME_CONFIRMED`, `OUTCOME_DISPUTED`, `OUTCOME_COI_DECLARED`, `OUTCOME_ESCALATED`, and `OUTCOME_WITHDRAWN`. The sweeper passes `system:outcome-sweeper` as its request id and `SYSTEM` as the actor role. Rejected: reusing `SIGN_IN_SUCCEEDED`-style generic actions — the audit trail has to answer "who changed this outcome" without joining another table.

**D8 — Non-participants get `404` on every outcome route.** Same rule as the request and mentorship controllers: resolve participation first, then act; `SESSION_NOT_FOUND` for a non-participant, `FORBIDDEN` nowhere in this surface.

**D9 — The outcome copies `field_id`, `student_profile_id`, and `mentor_profile_id` from the mentorship.** Reputation is field-scoped and pair-scoped, so the outcome must carry those keys rather than join through the mentorship at scoring time; a composite foreign key keeps them consistent with the mentorship row.

**D10 — `occurred_on` is optional and defaults to the report date.** The data model lists it as a `date`; requiring a student to date an outcome before they can report it adds a validation failure with no product value. Rejected: making it required and backfilling later.

## Data model

| Table | Columns | Constraints |
|---|---|---|
| `outcomes` | `id`, `mentorship_id` (FK, cascade), `student_profile_id`, `mentor_profile_id`, `field_id`, `outcome_type`, `title?`, `description`, `occurred_on` (date, default today), `contribution_claimed`, `contribution_confirmed?`, `status`, `evidence_tier` (default 0), `counted_basis?`, `coi_declared` (default false), `is_paid_relationship` (default false), `mentor_decision_due_at`, `confirmed_at?`, `cooling_ends_at?`, `counted_at?`, `rejected_at?`, `withdrawn_at?`, `reversed_at?`, `version` (default 1), timestamps | FK to `mentorships(id)`; check `description` length; check `status = 'COUNTED'` implies `counted_basis` is not null; check `counted_basis IN ('MENTOR_CONFIRMED','PLATFORM_DECISION')` when present; indexes on (`mentor_profile_id`,`field_id`,`status`), (`student_profile_id`), (`status`,`mentor_decision_due_at`), (`status`,`cooling_ends_at`) |
| `outcome_events` | `id`, `outcome_id`, `seq`, `event_type`, `actor_user_id?`, `actor_role?`, `from_status?`, `to_status?`, `payload jsonb`, `request_id`, `occurred_at` | unique (`outcome_id`,`seq`); partial unique (`outcome_id`,`event_type`) for the three timer types; index (`outcome_id`,`seq`) |
| `verification_records` | `id`, `outcome_id`, `kind`, `decision`, `attester_user_id?`, `contribution_level?`, `coi_declaration jsonb?`, `statement?`, `created_at` | check `kind`/`decision` pairs; index (`outcome_id`) |

Enums: `outcome_status` (7 values), `contribution_level` (`LED`, `SUPPORTED`, `COACHED`, `NOT_APPLICABLE`), `outcome_event_type` (the data-model list, minus the appeal values), `verifier_kind`, `verifier_decision`, `evidence_tier` is a `smallint` 0-2.

Grants: `outcomes` gets `SELECT, INSERT, UPDATE, DELETE`; `outcome_events` and `verification_records` get `SELECT, INSERT` only. The test list and its count grow by three, and each ledger table gets a `SET ROLE connect_app` probe asserting `UPDATE`/`DELETE` are refused.

## API surface

| Method and path | Roles | Notes |
|---|---|---|
| `POST /v1/outcomes` | S (participant) | body `mentorship_id`, `outcome_type`, `title?`, `description`, `contribution_claimed`, `occurred_on?` |
| `GET /v1/outcomes?mentorship_id=&status=` | S, M (participant) | own outcomes only |
| `GET /v1/outcomes/{id}` | participant | `404` otherwise |
| `POST /v1/outcomes/{id}/confirm` | M (mentor of the mentorship) | body `contribution_level_confirmed`, `coi_declaration?` |
| `POST /v1/outcomes/{id}/dispute` | M | body `reason` (required) |
| `POST /v1/outcomes/{id}/withdraw` | S (reporter) | allowed in the three open states |

The evidence endpoints from `docs/api-contracts.md` §5.6 are **not** implemented; the contract carries them as documented-but-unbuilt (see Open questions).

## State transitions

Implement `transition(from, action)` as a pure lookup over the data-model table:

| From | Action | To | Actor |
|---|---|---|---|
| (new) | report | `PENDING_CONFIRMATION` | student |
| `PENDING_CONFIRMATION` | confirm | `CONFIRMED` | mentor |
| `PENDING_CONFIRMATION` | confirm + conflict | `IN_PLATFORM_REVIEW` | mentor |
| `PENDING_CONFIRMATION` | dispute | `IN_PLATFORM_REVIEW` | mentor |
| `PENDING_CONFIRMATION` | escalate (day 7) | `IN_PLATFORM_REVIEW` | system |
| `PENDING_CONFIRMATION`, `CONFIRMED`, `IN_PLATFORM_REVIEW` | withdraw | `WITHDRAWN` | student |

Every other pair, including any write of `COUNTED`, returns `null` from the function and becomes `409 OUTCOME_INVALID_STATE` at the service boundary.

## Background jobs

Extend the sweeper family with one outcome pass, following the request sweeper: select a bounded batch by `mentor_decision_due_at` and status `PENDING_CONFIRMATION`, then per row append the reminder event and enqueue one email. Escalation sets `IN_PLATFORM_REVIEW`, appends `ESCALATED_D7`, and queues one email to both parties. Each effect is guarded by its partial unique index, so a second run writes nothing.

## Failure and edge cases

- Two mentors' devices confirm at once: the row lock on the outcome serializes them; the second sees `CONFIRMED` and answers `409`.
- Confirm with `coi_declaration` present: the confirmation is not stored as a confirmation; the status is `IN_PLATFORM_REVIEW` and the event is `COI_DECLARED`, so no code path can satisfy the eligibility predicate by accident.
- A withdrawal after the day-7 escalation closes the review state; the sweeper's later runs skip it because the status is no longer `PENDING_CONFIRMATION`.
- The audit insert fails after the event insert: the transaction rolls back both, so an unreported transition cannot leave an event without its audit row.
- A report against a `COMPLETED` mentorship is allowed (the outcome often arrives after the work ends); a report against a mentorship that does not exist or belongs to someone else is `404`.

## Risks / Trade-offs

- Three tables in one change → the ledger tables are separate DDL and separate grants, so a partial branch still migrates cleanly.
- `seq` under a row lock serializes concurrent transitions on the same outcome → accepted; a single outcome's transitions are inherently ordered.
- The eligibility predicate is inert until the next change → stated in the docs and tested, per D-47's exception.
- Reminder timing depends on the sweeper's cadence → the spec asserts "after day 3", not "at exactly hour 72".

## Migration plan

`0013` is additive: three tables, five enums, indexes, checks, three grants, and the append-only treatment for the two ledger tables. No existing table or column changes. Rollback drops the three tables and the enums.

## Open questions

- Whether the contract should publish the evidence endpoints now as "documented, not implemented", or omit them until the evidence change. This design keeps them out of `openapi.yaml` and records the gap as a known-debt row, so the contract never advertises a `404`.
- Whether the day-3 and day-5 reminders go to the mentor only or also nudge the student. This design sends both reminders to the mentor, matching `docs/data-model.md` T5's "no mentor decision" wording; a student nudge would need its own event type.
