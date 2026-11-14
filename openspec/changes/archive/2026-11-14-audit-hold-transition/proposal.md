# Proposal: audit-hold-transition

## Why

`docs/data-model.md` §4.4 lists T6 (`CONFIRMED` → `IN_PLATFORM_REVIEW` when a case is opened) and `DEBT-55` records that no code path performs it: `transition` (`packages/domain/src/outcome.ts`) returns `null` for every action from `CONFIRMED` except `withdraw`. `FR-ADM-03` (audit sampling) is a Must that cannot be built on top of that: a confirmed outcome has nowhere to be held, so "selected for audit and held from counting" has no state to occupy. This change adds the missing transition and nothing that consumes it.

## What Changes

- One new outcome action, `auditHold`, moving `CONFIRMED` to `IN_PLATFORM_REVIEW`, with no new enum value and no migration.
- One new outcome event and audit action pair for the hold, written by whatever calls the action, in the caller's transaction — the same shape the escalation path already uses.
- The review queue, the review route and the outcome screen need no change: the queue already lists every `IN_PLATFORM_REVIEW` row, `reviewTarget` already exits to `COUNTED`/`REJECTED`, and the student's action set already allows a withdraw from review.
- The property test that walks every (state, action) pair and every two- and three-step trace learns the new edge, so the invariant "nothing reaches `COUNTED` without a confirmation or a review decision" still holds.
- `FR-ADM-03`'s follow-up change calls this action; **until then nothing calls it**, which is a deliberate, owner-requested exception to the rule that no policy ships without a consumer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change adds one requirement to `mentorship/outcome-verification`; "Illegal transitions are refused" stays true, because the new pair is a legal one and every other pair is still refused.

## Impact

- **Code**: `packages/domain/src/outcome.ts` (`OUTCOME_ACTIONS`, `transition`, a `HOLD_REASONS` constant if the audit action needs one), `services/api/src/outcomes/drizzle-outcome.service.ts` (one `hold()` method plus its audit and event rows), `services/api/src/identity/audit-log.ts` and `services/api/src/audit/audit.service.ts` (the new action in **both** lists).
- **Tests**: `packages/domain/test/outcome-property.test.ts`, `packages/domain/test/outcome.test.ts`, `services/api/test/outcomes.integration.test.ts`, `apps/web/test/outcome-section.test.ts` (the screen already renders review correctly; the test freezes that).
- **API/contract**: no route and no request body change, so `openapi.yaml`, `body-keys.ts`, the authorization matrix and the request-validation inventory are untouched. The single-outcome read's `actions` list gains `audit_hold` as an available action only if the read ever serialises it; today it serialises status, not actions.
- **Data**: `outcome_events` gains a new `event_type` value and `outcome_events_type` enumerates through a check — the schema file names the exact values, so this is a migration only if the event type is enumerated rather than free text. `tasks.md` 0.2 settles it before any code.
- **Docs**: `docs/data-model.md` §4.4 (T6 becomes reachable, with the action name), `docs/known-debt.md` (`DEBT-55` closed), `docs/functional-requirements.md` (`FR-ADM-03` gap text now names the remaining work only), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `outcomes-and-verification` (archived 2026-11-08): the transition function and the event ledger.
- `platform-review-queue` (archived 2026-11-09): the review read and the `valid`/`invalid` decisions a hold is cleared through.
- `outcome-transition-property-test` (archived 2026-11-13): the property test that encodes the table and recorded `DEBT-55`.

## Out of scope

- The sampling job, the sampling rate, the anomaly trigger and the reviewer's audit checklist — all `FR-ADM-03`, a later change.
- A `disputes` table or a case object (`DEBT-28`).
- Who may open a hold: the caller of `hold()` is the future sampling job or a reviewer route, and this change names no route.
- Appeals (`FR-ADM-02`, Later).
- Any UI action: the hold is system-initiated, so no button is added.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An audit-cleared outcome counts as `PLATFORM_DECISION` (`outcomes_counted_basis_known` allows only `MENTOR_CONFIRMED` and `PLATFORM_DECISION`), so the mentor earns no reputation for it (D-63) | Stated in `design.md` as an owner-visible consequence of the existing check constraint; the pilot accepts it, and changing it needs an enum or a basis value, which is a separate decision |
| A held outcome stalls forever if the reviewer never decides | The hold is a normal review case on the existing queue, which has no SLA either (`DEBT-28`); the follow-up sampling change inherits that gap rather than creating it |
| The new action is added to the writer's union but not the read filter, so `GET /v1/admin/audit` rejects it with `422` | Both lists are in one task, and a test asserts the filter accepts every action a writer emits |

Rollback: revert the action and the `hold()` method. No migration, no data change; an outcome already held stays in `IN_PLATFORM_REVIEW` and is reviewable, which is the pre-change behaviour for a disputed outcome.
