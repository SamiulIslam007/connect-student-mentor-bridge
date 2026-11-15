# Proposal: audit-sampling

## Why

`FR-ADM-03` is a Must and it is `NOT STARTED`: nothing selects a confirmed outcome for audit, so the platform has no proactive check that a counted outcome was real. Only a dispute, a declared conflict, or a day-7 escalation ever brings a case to review. `audit-hold-transition` made the state reachable (`transition("CONFIRMED", "auditHold")` → `IN_PLATFORM_REVIEW`, D-162) and `OutcomeService.hold` exists with a conditional update and one audit row — but it has **no caller**: its own comment says "the caller is the future sampling job or a reviewer route" and the interface says "No route calls it yet: `FR-ADM-03` is the first caller". This change is that caller.

## What Changes

- One pure, deterministic sampling rule in `@connect/domain`: an outcome id hashes into a fixed draw, so the same outcome is always in or out and a job retry cannot re-roll the sample.
- A sample rate in `@connect/config` (`AUDIT_SAMPLE_RATE = 0.25`) and a fixed list of always-sampled outcome types (`ADMISSION`, `INTERNSHIP`, `JOB_OFFER`) while every difficulty weight is a `1.0` placeholder.
- A scheduled job on the existing worker (`audit-sampler`, every 15 minutes) that considers only `CONFIRMED` outcomes whose cooling period has not ended, holds each selected one through the existing `OutcomeService.hold`, and writes nothing else.
- One filter on the existing review queue, `GET /v1/review-queue?case_kind=`, so a held-for-audit case is distinguishable from a dispute, a declared conflict or a day-7 escalation. A held case currently reports `case_kind: "escalated_d7"`, which is wrong.
- The audit-hold reason is recorded in the existing `CASE_OPENED` event payload and the existing `OUTCOME_AUDIT_HELD` audit row. **No new audit action is introduced**: `OUTCOME_AUDIT_HELD` is already in both the writer union and the reader map, and a second row for the same fact is the defect shape D-168 rejected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mentorship/platform-review`: two requirements are added — one for selecting confirmed outcomes for audit before they count, one for filtering the queue by case kind. The existing "A reviewer decides a case once, with a written reason" requirement is unchanged and is what resolves a sampled case.

## Impact

- **Code**: `packages/config/src/index.ts` (two constants), `packages/domain/src/audit-sample.ts` (new pure rule), `services/api/src/outcomes/audit-sampler.ts` (new job), `services/api/src/platform/outbox/outbox-worker.ts` (one queue, one cron, one worker), `services/api/src/outcomes/drizzle-outcome.service.ts` (`reviewQueue` gains a `caseKind` filter; the derived case kind gains `AUDIT_HOLD`), `services/api/src/outcomes/review-queue.controller.ts` (one query parameter), `services/api/src/outcomes/outcome.service.ts` (the filter type).
- **Contract**: `packages/contracts/openapi.yaml` gains the `case_kind` query parameter and `audit_hold` in the `case_kind` enum. No new route, so `MATRIX` and `ROUTE_BODY_KEYS` are unchanged — the contract test asserts the parity.
- **Data**: none. No table, no column, no migration. The hold's state, event and audit row already exist.
- **Tests**: `packages/domain/test/audit-sample.test.ts` (determinism, rate, always-sampled types), `services/api/test/outcomes.integration.test.ts` (the job holds a selected outcome, skips a cooled one, is idempotent, and the queue filter separates the kinds).
- **Docs**: `docs/functional-requirements.md` (`FR-ADM-03` moves toward `DONE`; it stays `PARTIAL` until the anomaly clause is decided — the register must say which clause is left), `docs/matching-algorithm-spec.md` is untouched, `docs/api-contracts.md` §5.9, `docs/known-debt.md` (narrow `DEBT-29`, open one row for anomaly triggers), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

- `audit-hold-transition` (archived 2026-11-14): the transition, `OutcomeService.hold`, and the `OUTCOME_AUDIT_HELD` action. This change adds no state.
- `platform-review-queue` (archived 2026-11-09): the queue route and the review decision that clears a held case.
- `outbox-and-job-runner` (archived 2026-11-08): the worker and the queue registration pattern.

## Out of scope

- Anomaly-based triggers (device, network, velocity, pair frequency). No such signal exists in the system; the requirement's third clause is recorded as debt rather than invented.
- The sampling rate as a versioned, admin-editable value. `configuration-versioning` owns that; this change reads the rate through one seam so that change can replace the read without touching the job's logic.
- Any change to the difficulty weights, the Tier multipliers, or the cooling period.
- A reviewer assignment, SLA, appeal, or case object (`DEBT-28`, `DEBT-54`).
- Any UI. `/admin/reviews` already lists the queue; it gains no control.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The sampler holds a case that should have counted normally, delaying a mentor's reputation | Only `CONFIRMED` outcomes whose cooling period has **not** ended are considered, so a held case never claws back a counted one; `hold` refuses any other state with `409` |
| A retried or concurrent job holds the same outcome twice | The draw is deterministic on the outcome id (no re-roll), and `hold` is conditional on the status it read, so the second attempt is a `409` with nothing written |
| A 25% sample plus 100% of three common outcome types floods the only reviewer | The rate is one constant and the always-sampled list is one constant; a pilot week of 20 confirmations is about 5 to 8 cases. The design states the arithmetic so the owner can lower either value before the pilot |
| A job exception leaves an outcome stuck in a half-held state | The hold is one transaction: status, event and audit row commit together or not at all |
| The queue's derived case kind silently mislabels a held case, so a reviewer resolves it as a dispute | The derivation gains an explicit `AUDIT_HOLD` branch with a test, and the filter's enum is contract-checked |

Rollback: remove the queue registration in `outbox-worker.ts` and the worker stops sampling. Outcomes already held stay in review and are resolved by the existing decision route; nothing is deleted and no reputation is touched.

## Decisions taken here

The brief says "add the audit actions to both the writer and the reader unions". This change adds **no** audit action, because the action it would add already exists: `OUTCOME_AUDIT_HELD` is written by `hold` and is present in `AUDIT_ACTION_MAP`. The change instead adds a parity assertion that the action a sampler triggers is filterable, which is the property the instruction protects. Every later change in this round that really does add an action (`CONFIGURATION_CHANGED`, `EVIDENCE_VIEWED`, `EVIDENCE_RETENTION_DELETED`) does add it to both.
