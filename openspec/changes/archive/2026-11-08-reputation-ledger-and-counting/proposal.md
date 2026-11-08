# Proposal: reputation-ledger-and-counting

## Why

The product's promise is that confirmed progress builds credible reputation, and today nothing converts a confirmed outcome into a counted one. `docs/data-model.md:261` (T7) and `docs/reputation-and-verification-policy.md` §7 define the counting step and the points formula, but `outcomes-and-verification` deliberately stops at `CONFIRMED`, so no ledger exists. This change closes that edge: a job counts eligible outcomes, one append-only event records the points, and a mentor can finally see counts of counted outcomes.

## What Changes

- A counting job promotes a `CONFIRMED` outcome to `COUNTED` when `cooling_ends_at` has passed and no review case is open, writing `counted_at` and `counted_basis`, appending one `COUNTED` event, and appending exactly one `reputation_events` row.
- `reputation_events` applies `difficulty_weight × tier_multiplier × contribution_multiplier × pair_factor`, with `pair_factor = 1 / (1 + n)` over earlier counted outcomes for the same mentor and student. Every weight ships as a uniform placeholder (`1.0`) in `@connect/config` and no numeric score is exposed anywhere.
- `field_impact_snapshots` stores the per-field totals, and recomputing them from the ledger must reproduce them byte-for-byte.
- New read endpoints `GET /v1/me/impact` and `GET /v1/mentors/{id}/impact` return counts by field and outcome type only, excluding every non-counted state.
- A profile impact section in `apps/web`, counts only, reusing the existing tokens and components.
- `#10` is split: `platform-review-queue` (reviewer decisions with a written reason, `REJECTED`, clawback) becomes a later change; the plan is updated in the same branch.

## Capabilities

### New Capabilities

- `mentorship/reputation-ledger`: the cooling-to-counting transition, the append-only reputation event, the replayable field snapshot, and the counts-only impact view.

### Modified Capabilities

None. No existing requirement describes counting or reputation, and `mentorship/outcome-verification` owns the states this change consumes without restating them.

## Impact

- **Code**: `packages/domain/src/reputation.ts` (new), `packages/config/src/index.ts` (weights and placeholders), `services/api/src/db/schema/reputation.ts` (new) and `enums.ts`, migration `0014`, `services/api/src/reputation/*` (new module: counting job, impact queries, controller), a sweeper or worker registration, `apps/web/app/profile/*` (impact section), `apps/web/app/api/me/impact/route.ts`, `apps/web/lib/strings.ts`.
- **Tests**: `packages/domain/test/reputation.test.ts` (new), `services/api/test/reputation.integration.test.ts` (new), `authorization-matrix.test.ts`, `database.integration.test.ts`.
- **API/data**: two tables, one enum (`reputation_event_type`), two endpoints, `packages/contracts/openapi.yaml`.
- **Dependencies**: none added.
- **Docs**: `docs/data-model.md`, `docs/api-contracts.md`, `docs/functional-requirements.md`, `docs/reputation-and-verification-policy.md`, `docs/known-debt.md`, `docs/mvp-build-plan.md` §5 (the split), `docs/milestones-and-phases.md`, `docs/decision-log.md`, `README.md`.

## Depends on

- `outcomes-and-verification` (Change 2 of this round): `outcomes`, `outcome_events`, the `CONFIRMED` and `cooling_ends_at` columns, the transition function, and the `earnsMentorReputation` predicate. Without that change this one has no input and no eligibility rule.
- `mentorship-thread-and-sessions` (Change 1 of this round): `mentorships.field_id`, `student_profile_id`, and `mentor_profile_id`, which the reputation event copies.
- `platform/outbox-and-job-runner` (6a, archived 2026-11-08): `services/api/src/platform/outbox/outbox.ts` and the worker, which is where the counting pass registers.
- `profiles/student-and-mentor-profiles`: the mentor profile read shape the impact endpoint extends.

## Out of scope

- The platform-review queue, reviewer assignment, written reasons, and `REJECTED`.
- Clawback and reversal (a compensating negative ledger entry).
- Confidence-tier labels (`Emerging`, `Established`, `Proven`) — Phase 1b per `docs/milestones-and-phases.md:133`.
- Any public numeric score, global ranking, cross-field comparison, or response-reliability metric.
- Institution aggregates and suppression.
- Discovery and ranking (`#6`, deferred by D-58).
- Any change to the outcome state machine or its endpoints.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A pending or in-review outcome counts, breaking the central trust rule | Counting is one conditional update on `CONFIRMED` with a `cooling_ends_at` guard and an explicit eligibility check; tests assert every non-counted state writes no event and no snapshot change |
| The ledger becomes rewritable, so a score can be edited | Insert-and-select grants on `reputation_events`, a `SET ROLE connect_app` probe, and no update path in code |
| A placeholder weight is mistaken for a calibrated ranking | All multipliers are `1.0`, no score is exposed by any endpoint, and every row is labelled a placeholder in code, config, and the policy doc |
| The snapshot drifts from the ledger | The replay test recomputes the snapshot from events and asserts exact equality; the snapshot is written only by the counting job |
| Splitting `#10` loses the review queue | The split is recorded in `docs/mvp-build-plan.md` §5 with `platform-review-queue` keeping its place, and in a `D-xx` row |

Rollback: drop the two tables and the enum, remove the module and the job registration, revert the plan split. Counting already performed is lost with the ledger, so rollback is only safe before real users (Gate 2).

**Traces to** FR-OUT-10, FR-REP-01, FR-REP-02, FR-REP-03, FR-REP-04, FR-REP-05, FR-REP-07; ADR-008 (reputation is derived), ADR-012 (pure domain), ADR-018 (Drizzle); D-66 (split of #10), D-67 (placeholder weights), D-68 (counts-only impact view now); DEBT-20 (closed by Change 1).
