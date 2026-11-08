# Proposal

## Why

The product's promise is a mentor deciding within 48 hours, and no request exists yet: there is no `mentorship_requests` table, no endpoint, and no timer. Everything built so far — identity, profiles, availability, access mode, mentor activation — has no user-facing outcome until a student can send a request and a mentor can answer it.

## What Changes

- Add the `mentorship_requests` table with the canonical `request_status`, `interaction_type`, and `timeframe_bucket` enums, the one-pending-request-per-pair partial unique index, and the hand-written `connect_app` grant.
- Add `POST /v1/requests`, `GET /v1/requests`, `GET /v1/requests/{id}`, and `POST /v1/requests/{id}/accept|decline|withdraw`.
- Enforce the creation rules in one transaction with a mentor-profile row lock: the mentor is `ACTIVE` with Level 1 affiliation (from #5), not paused, not the caller, under the weekly capacity, and has no pending request from this student; at most 3 pending requests per student.
- Enforce `APPLICATION_ONLY` by requiring a non-empty `application_note` on the request instead of leaving the mode inert.
- Add the 48-hour expiry and 24-hour reminder as one sweeper job that runs every 5 minutes in the worker from 6a, writing `EmailRequested` outbox events and moving the request to `EXPIRED` at most once.
- Queue the three request emails (received, decision, expired) through the outbox with a dedupe key per event.
- Add `/requests` (sent and received lists with accept, decline, and withdraw) and `/request/new?mentor=<mentor_profile_id>` (the structured form).
- Update `docs/api-contracts.md` §5.4, `docs/data-model.md` §4.1/§5.3, `docs/known-debt.md` (`DEBT-17` closes, a new debt row for the missing mentorship), and the plan/tracker docs.

## Capabilities

### New Capabilities

- `mentorship/request-lifecycle`: the structured request, its eligibility and capacity rules, the accept/decline/withdraw transitions, and the 24-hour reminder and 48-hour expiry. Traces to FR-REQ-01, 02, 03, 05, 06, 07, 08 and FR-NOT-01.

### Modified Capabilities

- `profiles/availability-and-access-mode`: the requirement **APPLICATION_ONLY has no enforcement in this change** is replaced. That requirement says no request path may be gated by the mode "until the request flow lands"; this is that flow. Its own wording makes the modification mandatory rather than optional.

## Impact

- **Code:** `services/api/src/requests/` (module, service, controller), `packages/domain/src/request.ts` (transition and capacity rules), one sweeper job in the worker, `apps/web/app/requests/page.tsx`, `apps/web/app/request/new/page.tsx` plus their BFF routes and strings, `packages/contracts/openapi.yaml`.
- **Data:** one migration (`0011`): three enums, one table, its indexes and checks, the grant. No backfill.
- **Dependencies:** none beyond #5 and 6a.
- **Docs:** `data-model.md` §4.1/§5.3, `api-contracts.md` §5.4 and the error-code table, `functional-requirements.md` build notes, `known-debt.md`, `mvp-build-plan.md` §5 row #7, `milestones-and-phases.md` Current state.

## Out of scope

- **Discovery (#6)**: there is no mentor list, so the request form takes a mentor profile id from a link the pilot shares. This is deliberate; #6 replaces the link with suggestions.
- **Mentorship creation on acceptance** (#8): an accepted request stays an accepted request. `data-model.md` line 209 says acceptance creates a `mentorships` row; that sentence moves to #8, and capacity in this change counts accepted requests instead.
- **Redirect with alternatives** (FR-REQ-04, Phase 1b), `request_alternatives`, `suggestion_logs`, `notifications`/`notification_preferences`, and the `idempotency_keys` table: duplicate submission is deduplicated by the pending-pair unique index rather than a stored key.
- **Capacity check on pause/resume** (`DEBT-17`'s second half): it needs active mentorships, which arrive in #8, so it stays open with #8 as the owner.
- **Match score and factor snapshots** on the request row: #6 owns them.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Two concurrent submissions overshoot the capacity cap | The accept and create paths lock the mentor profile row (`SELECT … FOR UPDATE`) before counting, and a test runs two concurrent creates asserting the cap holds |
| A request is accepted and the same request is accepted again | The transition is a conditional `UPDATE … WHERE status = 'PENDING'` returning the row; a second accept affects zero rows and answers `409 REQUEST_INVALID_STATE` |
| The reminder or expiry runs twice | The sweeper updates with `WHERE reminder_sent_at IS NULL` / `WHERE status = 'PENDING'`, and the email event carries a unique `dedupe_key` |
| A mentor is deactivated or loses Level 1 with pending requests | Creation checks `ACTIVE` + Level 1 at write time; a pending request to a mentor that later loses activation expires at 48 hours like any other, with no separate path |
| A stale sweeper means a request never expires | The sweeper is idempotent and queries by due timestamp, so one missed run is caught by the next; a test drives it twice and asserts a single expiry email |

**Rollback:** revert the change and run a forward migration that drops the table and its enums. The API returns to having no request routes; nothing else reads them.

**Traces to** FR-REQ-01, FR-REQ-02, FR-REQ-03, FR-REQ-05, FR-REQ-06, FR-REQ-07, FR-REQ-08, FR-NOT-01, FR-DISC-03 (access-state copy), FR-VER-04 (Level 1 gate), FR-PROF-02 (capacity), D-38, D-58, DEBT-17, ADR-006.
