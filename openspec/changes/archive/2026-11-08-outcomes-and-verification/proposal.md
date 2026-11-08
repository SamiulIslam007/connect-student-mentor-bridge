# Proposal: outcomes-and-verification

## Why

A mentorship with no outcome record cannot prove anything, and the product's central claim — "unconfirmed means uncounted" — has nothing to be true about until outcomes exist. `docs/data-model.md` §4.4 defines the seven-state machine and `docs/api-contracts.md` §5.6 defines the endpoints, but no table, route, or code exists today (`packages/contracts/openapi.yaml` declares no outcome path). This change makes the report → confirm → dispute half real and leaves the counting edge to `reputation-ledger-and-counting`.

## What Changes

- Three new tables: `outcomes` (projection of current state), `outcome_events` (append-only, gap-free `seq` per outcome), `verification_records` (append-only attestations), with `connect_app` granted `SELECT, INSERT` only on the two ledger tables.
- The state machine from `docs/data-model.md` §4.4 transitions T1–T11, appeals excluded, implemented as a pure domain function over `outcome_status`; every illegal move answers `409 OUTCOME_INVALID_STATE`.
- Report, confirm (fact and contribution level separately), dispute with a reason, declare a conflict of interest, and withdraw as API endpoints; a dispute, a declared conflict, or the day-7 timer all land in `IN_PLATFORM_REVIEW`.
- `OUT-Q1` becomes executable: a platform-decided outcome never earns mentor reputation, encoded as a domain predicate and a test even though `COUNTED` is unreachable in this change.
- A sweeper extension: day-3 and day-5 reminders and a day-7 escalation, each at most once per outcome, driven by timers on the row.
- Every transition appends one `outcome_events` row and one `audit_logs` entry in the same transaction; the audit action union grows with the outcome actions.
- Student report form and mentor decision screen in `apps/web`, reusing existing tokens and the string catalog.

## Capabilities

### New Capabilities

- `mentorship/outcome-verification`: reporting an outcome against a mentorship, the mentor's confirm/dispute/conflict decision, the student's withdrawal, the platform-review state, the append-only event history, and the reminder timers.

### Modified Capabilities

None. No existing requirement is restated or removed: `trust/consent-and-audit-records` enumerates authentication events and does not forbid additional audited events, and `platform/database-roles` grants the baseline tables without claiming to be a closed list.

## Impact

- **Code**: `packages/domain/src/outcome.ts` (new), `packages/config/src/index.ts` (cooling period), `services/api/src/db/schema/outcomes.ts` (new) and `enums.ts`, migration `0013`, `services/api/src/outcomes/*` (new module), `services/api/src/requests/request-sweeper.ts` or a sibling outcome sweeper, `services/api/src/identity/audit-log.ts` (action union), `apps/web/app/outcomes/*` and `apps/web/app/api/outcomes/**`, `apps/web/lib/strings.ts`.
- **Tests**: `packages/domain/test/outcome.test.ts` (new), `services/api/test/outcomes.integration.test.ts` (new), `authorization-matrix.test.ts`, `database.integration.test.ts`.
- **API/data**: three tables, four enums, nine endpoints, `packages/contracts/openapi.yaml`.
- **Dependencies**: none added.
- **Docs**: `docs/data-model.md`, `docs/api-contracts.md`, `docs/functional-requirements.md`, `docs/reputation-and-verification-policy.md`, `docs/known-debt.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`, `docs/decision-log.md`, `README.md`.

## Depends on

- `mentorship-thread-and-sessions` (Change 1 of this round): the `mentorships` table and `mentorship_id`, without which an outcome has no subject. Its spec `mentorship/thread-and-sessions` defines the mentorship lifecycle this change reads.
- `outbox-and-job-runner` (6a, archived 2026-11-08): `services/api/src/platform/outbox/outbox.ts` for the queued report and decision emails.
- `trust/consent-and-audit-records` (Sprint 1) and `services/api/src/identity/audit-log.ts`: the append-only audit writer and its fail-closed expectation.
- `requests-and-48h-flow` (#7): `services/api/src/requests/request-sweeper.ts` is the timer pattern this change copies, including its "safe to run repeatedly" shape.

## Out of scope

- Evidence upload, signed URLs, malware scanning, and any `evidence_tier` above 0.
- A `disputes` case table; the dispute reason is carried on `verification_records` until `platform-review-queue`.
- Platform-review decisions, written reasons, reviewer routing, and `REJECTED`.
- `COUNTED`, cooling-to-counting jobs, `reputation_events`, snapshots, clawback, and reversal.
- Appeals (`APPEAL_OPENED`/`APPEAL_RESOLVED` stay reserved).
- Institution aggregates, student progress views, and any score.
- Editing an outcome's text after it is reported.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A trust rule is weakened by an illegal transition path | The transition table is a pure function with a test per legal and illegal pair; no service writes `status` outside it |
| The ledger becomes rewritable | `outcome_events` and `verification_records` get `SELECT, INSERT` only, and a probe running as `connect_app` asserts `UPDATE`/`DELETE` are refused |
| A reminder or escalation fires twice | One partial unique index per event type per outcome, asserted by running the sweeper twice |
| The cooling period is mistaken for a decided value | It ships in `@connect/config` labelled a Proposed default (API-O7), with an open question naming the owner decision |
| Outcome emails flood the mentor | This change sends one email per report and one per decision; reminders are 3 and 5 only, per the policy |

Rollback: drop the three tables and the enums, remove the module and the sweeper branch. No existing table changes, so no data migration is needed backwards; outcomes already reported would be lost, which is acceptable only before real users (Gate 2).

**Traces to** FR-OUT-01, FR-OUT-03, FR-OUT-04, FR-OUT-05, FR-OUT-06, FR-OUT-07, FR-OUT-09, FR-OUT-11; ADR-008 (derived reputation), ADR-012 (pure domain); D-63 (OUT-Q1), D-64 (Tier 0 only); DEBT-14.
