# Proposal: platform-review-queue

## Why

Four paths lead an outcome into `IN_PLATFORM_REVIEW` — a mentor dispute, a declared conflict of interest, the day-7 no-response escalation, and (unbuilt) an audit — and **no path leads out**. `docs/known-debt.md` DEBT-23 records it: disputed outcomes accumulate forever, so the product's central promise ("confirmed, counted outcomes") cannot be delivered for any mentorship that hits a disagreement. Counting is already provably correct and replayable, which is exactly the precondition that D-66 named for letting a reviewer reverse it.

## What Changes

- Add the only exit from `IN_PLATFORM_REVIEW`: `POST /v1/outcomes/{id}/review` with a required written reason, `valid` moving the outcome to `COUNTED` and `invalid` to `REJECTED`.
- Make clawback reachable: the same endpoint accepts an already-`COUNTED` outcome with `invalid` and performs T11 — status `REVERSED`, a compensating `REVERSAL` reputation event, and a snapshot total that re-derives from the ledger rather than being edited. `valid` on a `COUNTED` outcome is `409`.
- Add `GET /v1/review-queue` for `PLATFORM_ADMIN` under the existing `requiresMfa` guard: open cases with the outcome summary, the case kind, the reason, and when it was opened.
- Expose the decision and its reason to both participants through the existing outcome read, so neither party learns the result without the reason.
- One audit row and one outbox email per decision (student and, where applicable, mentor).
- Add a minimal `/admin/reviews` page that lists cases and submits a decision with a reason.
- Widen the reputation ledger for reversal (migration `0015`): the `event_type` check becomes `('COUNTED', 'REVERSAL')`, and the single unique index on `outcome_id` becomes two partial unique indexes, one per event type.
- Record D-73 to D-77, close DEBT-23, narrow FR-ADM-01 explicitly (no assignment, no due dates), and correct `docs/data-model.md` §4.5, whose `disputes` table is not built.

## Capabilities

### New Capabilities

- `mentorship/platform-review`: the review queue read, the reviewer decision with a written reason, the participant-visible decision record, and the clawback entry.

### Modified Capabilities

- `mentorship/outcome-verification`: the transition requirement is restated so the reviewer moves are legal (its "counting has no route in this change" scenario currently forbids the outcome this change ships).
- `mentorship/reputation-ledger`: a new requirement for reversal — one compensating event, a decremented snapshot, and a replay that still reproduces the stored totals after a reversal.

## Impact

- **Code**: `services/api/src/outcomes/{outcomes.controller.ts,outcome.service.ts,drizzle-outcome.service.ts}` (review action, queue read, decision exposure), `services/api/src/db/schema/reputation.ts` (the two partial indexes and the widened check), migration `0015`, `services/api/src/reputation/counting-job.ts` (shared snapshot-update helper used by both directions), `apps/web/app/api/review-queue/route.ts`, `apps/web/app/api/outcomes/[[...path]]/route.ts` (the review action), `apps/web/app/admin/reviews/page.tsx`, `apps/web/lib/{strings.ts,navigation.ts}`.
- **Tests**: `services/api/test/outcomes.integration.test.ts` (decision paths, reason required, participant visibility, non-admin refusals, MFA), `reputation.integration.test.ts` (reversal and replay), `authorization-matrix.test.ts`, `database.integration.test.ts` (the new index shapes), `apps/web/test/review-queue-page.test.ts`, `review-queue-route.test.ts`.
- **API/data**: two endpoints plus an added `decisions` array on the outcome read; migration `0015`; no new table and no new enum value.
- **Dependencies**: none added.
- **Docs**: `docs/data-model.md` §4.4/§4.5/§5.6, `docs/api-contracts.md` §5.6 and §5.9, `docs/functional-requirements.md` FR-ADM-01, `docs/reputation-and-verification-policy.md` §7 (clawback), `docs/known-debt.md` (DEBT-23 closed, DEBT-25 unchanged), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `docs/decision-log.md`, `README.md`.

## Depends on

- `mentorship/outcome-verification` (#9, archived): the seven-state machine, `outcome_events`, `verification_records`, the reason-bearing dispute and conflict paths, and the day-7 escalation that fills the queue.
- `mentorship/reputation-ledger` (#10a, archived): `reputation_events`, `field_impact_snapshots`, the replay test, and the `1.0` placeholder weights.
- `identity/role-authorization` (4c, archived): `PLATFORM_ADMIN` and `requireRole(..., { requiresMfa: true })`, which already refuses with `403 MFA_REQUIRED`.
- `platform/outbox-and-job-runner` (6a, archived): the queued email the decision sends.

## Out of scope

- Appeals, a second reviewer, and appeal windows (FR-ADM-02, **Later**).
- Assignment, due dates, SLAs, and case ownership — an explicit narrowing of FR-ADM-01, recorded as a decision.
- The `disputes` table and its `dispute_kind`/`dispute_status` enums (`docs/data-model.md` §4.5): not built; the case stays the outcome row plus its verification records, and §4.5 says so after this change.
- Audit sampling driven by a scheduler (FR-ADM-03) and anomaly detection: only the reviewer's manual decision ships.
- Abuse reporting (FR-ADM-04), sanctions (FR-ADM-05), break-glass thread access (FR-ADM-06), configuration management (FR-ADM-07).
- Any change to the dispute or conflict entry paths, or to the counting job's schedule.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A reviewer decision counts an outcome that never had a mentor confirmation | The counted basis is `PLATFORM_DECISION` for every outcome this path counts, and D-63's predicate keeps it out of mentor reputation; the test asserts no reputation event is written |
| Clawback edits history | The reversal is a second appended event with negative points; the replay test recomputes from both events and asserts equality; update and delete stay ungranted |
| The unique index blocks the reversal row | Migration `0015` replaces it with two partial unique indexes before the code ships, and the integration test asserts one `COUNTED` plus one `REVERSAL` row can coexist |
| The queue leaks student data to a non-admin | The queue read requires `PLATFORM_ADMIN` plus an active second factor, and the permission matrix test asserts every other principal is refused |
| A decision is applied twice | One conditional update on the current status, one `CASE_RESOLVED` event, and the status guard make the second call `409` |

Rollback: revert the endpoint, the queue read, the page, and the migration's index change (the widened check can stay; it accepts `COUNTED` only until a reversal row exists). Any decision already applied is an append-only fact and cannot be undone by a rollback — the ledger records it, and the status is the projection.

**Traces to** FR-ADM-01 (review queue and resolution with a reason, narrowed by D-76), FR-ADM-02 (**Later**), FR-OUT-05 and D-63 (a platform-decided outcome never earns mentor reputation), FR-REP-01 and FR-REP-05 (derived, replayable reputation); ADR-008 (append-only ledger), ADR-012 (pure domain rules), ADR-018 (Drizzle); D-65 (the review half deferred here), D-66 (the split), D-73 to D-77 (this change's decisions); DEBT-23 (closed here).
