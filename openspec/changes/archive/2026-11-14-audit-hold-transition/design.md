# Design: audit-hold-transition

## Context

**Repository snapshot (verified 2026-11-14 at propose, re-check at apply).**

- Base: `main` at `42768e9`, clean tree, zero active changes; gates at propose: lint 0, typecheck 0, 674 tests / 0 fail / 0 skipped, build 0.
- `OUTCOME_ACTIONS` is `report`, `confirm`, `declareConflict`, `dispute`, `escalate`, `withdraw` (`packages/domain/src/outcome.ts` lines 20–27). `transition()` (line 40) returns `IN_PLATFORM_REVIEW` from `PENDING_CONFIRMATION` for `declareConflict`, `dispute` and `escalate`, and from `CONFIRMED` only `withdraw` succeeds, via `OUTCOME_OPEN_STATUSES` (line 30).
- `reviewTarget()` (line 75) already maps `IN_PLATFORM_REVIEW` → `COUNTED` (`valid`) or `REJECTED` (`invalid`), and `COUNTED` + `invalid` → `REVERSED`. It needs no change for a held outcome.
- The review queue read filters `eq(outcomes.status, "IN_PLATFORM_REVIEW")` (`services/api/src/outcomes/drizzle-outcome.service.ts` line 763), so a held outcome reaches the existing admin page with no new query.
- `outcome_event_type` is a Postgres enum (`services/api/src/db/schema/enums.ts` line 170) and **already contains `CASE_OPENED` and `CASE_RESOLVED`**. Reusing `CASE_OPENED` means no migration.
- `outcomes_counted_basis_known` allows only `MENTOR_CONFIRMED` and `PLATFORM_DECISION` (`services/api/src/db/schema/outcomes.ts` line 88), and `earnsMentorReputation` (D-63) refuses mentor reputation for a platform decision.
- The audit action union (`services/api/src/identity/audit-log.ts` lines 26–33) has no case-opened member; the read filter's list lives in `services/api/src/audit/audit.service.ts` and must gain it in the same task.
- The outcome screen's action set (`apps/web/lib/outcome-view.ts` line 69, `actionsFor`) already allows withdraw from `in_platform_review`, and `outcomeStatusLabel` (line 11) already names that state. No UI edit is needed; a test freezes it.
- `packages/domain/test/outcome-property.test.ts` walks all 42 (state, action) pairs and every two- and three-step trace.

## Goals / Non-Goals

**Goals**

- T6 is reachable and is the only way into review from `CONFIRMED`.
- The invariant "`COUNTED` needs a confirmation or a review decision" survives the new edge, proved by the existing property test.
- No migration, no new enum value, no route.

**Non-Goals**

- No sampling, no rate, no anomaly trigger, no reviewer checklist, no route that opens a hold.
- No UI control: the hold is system-initiated.
- No `disputes` table (`DEBT-28`).

## Decisions

The owner fixed the action name (`auditHold`), the target state, the no-migration rule and the clearing route. Decisions taken here carry `R` numbers.

### R1. The hold writes the existing `CASE_OPENED` event type

`outcome_event_type` already enumerates `CASE_OPENED` and `CASE_RESOLVED`, which is exactly the fact being recorded; a new value would be a migration for a synonym. Alternative rejected: adding `AUDIT_HELD`, which forces `ALTER TYPE … ADD VALUE` and breaks the transaction-scoped migration style this repo uses.

### R2. A new audit action `OUTCOME_AUDIT_HELD`, added to the union and the read filter together

The outcome-level fact is not a review decision, so `OUTCOME_REVIEWED` would be a lie. Both lists change in one task (`identity/audit-log.ts` and `audit/audit.service.ts`), because a writer without a filter value stores a row the admin page answers `422` for.

### R3. `hold()` lives in the outcome service and takes the actor and the reason

Signature: `hold({ outcomeId, actorUserId, actorRole, reason, requestId })`. It re-reads the row under the same conditional update shape the review route uses (`WHERE id = … AND status = 'CONFIRMED'`), so a concurrent confirm-then-count cannot be held; a zero-row match is `409 OUTCOME_INVALID_STATE` and writes nothing. It appends the event, the audit row and no email. Alternative rejected: a pure-service write from the caller, which would spread the transaction boundary across two modules.

### R4. No state-machine change in `reviewTarget`, and no UI change

A held outcome is an ordinary review case: the queue lists it, `valid` counts it, `invalid` rejects it. `actionsFor` already allows the student to withdraw from review and the label already exists. The task list asserts this rather than editing two files to no effect, and `apps/web/test/outcome-section.test.ts` gains one assertion so a future edit cannot take the withdraw action away from a held outcome.

### R5. The consequence of clearing a hold is reputation-neutral, and that is accepted

`counted_basis` is constrained to `MENTOR_CONFIRMED` or `PLATFORM_DECISION`; a hold cleared as valid counts as the latter, so the mentor earns no reputation for that outcome (D-63). The alternative — a third basis value for "audit-cleared" — is a schema check change plus a reputation-policy decision, and it is out of this change. Recorded so the owner sees it before the sampling job ships, not after.

### R6. The action has no caller until `FR-ADM-03`, and that is deliberate

A pure action with no consumer is the one thing this repository otherwise refuses (D-47). The owner asked for the transition alone because the sampling change cannot be specified against a table with a missing row. The follow-up change is named in `docs/known-debt.md`'s `DEBT-55` closure and in the `FR-ADM-03` status line.

## Assumptions

1. A hold is never opened by a participant; only the future sampling job or a reviewer route calls it.
2. The counting job reads `status`, so a held row is skipped without a query change (verified: `countDueOutcomes` filters `CONFIRMED`).
3. No email is due on a hold: the participant already learns of a review outcome, not of its opening. If the owner wants an opening notice, it is one template and one task, and it is not in this change.

## Risks

- The action exists with no caller for one change window. Mitigation: `DEBT-55` closes with the follow-up named, and the design says so in two places.
- A reviewer could read "held" as "already disputed". Mitigation: the audit row carries `reason`, and the follow-up change surfaces the case kind (`DEBT-28`).

## Acceptance criteria

1. `transition("CONFIRMED", "auditHold")` is `IN_PLATFORM_REVIEW`; every other state returns `null` for it.
2. The property test's pair table contains the new pair and still refuses every illegal pair.
3. `hold()` writes one event with `event_type = CASE_OPENED`, one audit row `OUTCOME_AUDIT_HELD`, and an unchanged `counted_basis`.
4. A second hold on the same outcome is `409` and writes nothing.
5. `GET /v1/admin/audit` accepts `OUTCOME_AUDIT_HELD` as a filter value.
6. A held outcome appears in `GET /v1/review-queue` and clears to `COUNTED` with `PLATFORM_DECISION`.
7. No migration is added; `git diff --stat -- services/api/drizzle` is empty.
