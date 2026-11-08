# Proposal: mentorship-thread-and-sessions

## Why

Accepting a request currently produces nothing: `decide()` in `services/api/src/requests/drizzle-requests.service.ts:399-493` only flips `mentorship_requests.status`, and `docs/known-debt.md:36` (DEBT-20) records that no `mentorships` row exists. The outcome ledger (change #9) has nothing to attach an outcome to, so every later change on the product spine waits on this one. This change creates the mentorship on acceptance and gives it the thread, agreement, and session records the pilot demonstrates.

## What Changes

- Accepting a request SHALL create exactly one `mentorships` row inside the existing accept transaction (unique `request_id`). A decline creates none; a failed insert leaves the request `PENDING` and queues no email.
- Three new tables: `mentorships`, `thread_messages`, `mentorship_sessions`, with the hand-written `connect_app` grant each new table needs.
- New API surface: `GET /v1/mentorships`, `GET /v1/mentorships/{id}`, `PUT /v1/mentorships/{id}/agreement`, `POST /v1/mentorships/{id}/agreement/acknowledge`, `GET|POST /v1/mentorships/{id}/messages`, `POST /v1/mentorships/{id}/sessions`, `POST /v1/sessions/{id}/confirm-held`, `POST /v1/mentorships/{id}/complete`.
- One outbox email per thread message, deduplicated on the message id; no inline send.
- Resume now refuses when the mentor's live `ACTIVE` mentorships are at or above `weekly_capacity` (`DEBT-17`), closing a scenario that `profiles/availability-and-access-mode` currently declares out of scope.
- A `/mentorship/{id}` page and its BFF routes in `apps/web`, reusing existing tokens, components, and the string catalog.
- Docs corrections carried by this branch: the stale "MFA enforcement arrives with 4c" sentence and the stale "Schema (Drizzle) and migrations do not exist yet" line, plus the README status line, "Last reviewed", and the "Not built yet" list.

## Capabilities

### New Capabilities

- `mentorship/thread-and-sessions`: the mentorship record created on acceptance, its participant-only thread, the lightweight agreement, and the planned session with a mentor-pasted meeting link and mutual held confirmation.

### Modified Capabilities

- `mentorship/request-lifecycle`: "A mentor decides a pending request exactly once" gains the mentorship creation and the rollback guarantee on accept.
- `profiles/availability-and-access-mode`: "The mentor access mode is one of three stored values" gains the resume capacity check, replacing the scenario that says no such check runs.

## Impact

- **Code**: `packages/domain/src/mentorship.ts` (new), `services/api/src/db/schema/mentorships.ts` (new) and `enums.ts`, a new migration `0012`, `services/api/src/mentorships/*` (new module), `services/api/src/requests/drizzle-requests.service.ts` (accept path), `services/api/src/profiles/drizzle-profiles.service.ts` (resume path), `apps/web/app/mentorship/[id]/*` and `apps/web/app/api/mentorships/**` (new), `apps/web/lib/strings.ts`.
- **Tests**: `services/api/test/mentorship.integration.test.ts` (new), `authorization-matrix.test.ts` (route matrix), `database.integration.test.ts` (table list and its "twenty tables" title), `apps/web/test/*` for the BFF and the page.
- **API/data**: three tables, one enum family, nine endpoints, `packages/contracts/openapi.yaml`.
- **Dependencies**: none added. Uses the installed NestJS, Drizzle, pg-boss, and Next.js packages.
- **Docs**: `docs/data-model.md`, `docs/api-contracts.md`, `docs/functional-requirements.md`, `docs/known-debt.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`, `README.md`, `AGENTS.local.md`, `docs/decision-log.md`.

## Depends on

- `requests-and-48h-flow` (#7, archived 2026-11-08): `decide()` and its transaction (`services/api/src/requests/drizzle-requests.service.ts`), the request table and its grant (`services/api/drizzle/0011_workable_silver_sable.sql`).
- `outbox-and-job-runner` (6a, archived 2026-11-08): `services/api/src/platform/outbox/outbox.ts` for queued mail and the worker that delivers it.
- `affiliation-and-mentor-onboarding` (#5) and `role-authorization` (4c): the `ACTIVE`/Level-1 pair and `requireRole` already exist; this change adds no eligibility rule.

## Out of scope

- Private session feedback (`private_feedback`, Phase 1b per `docs/data-model.md:430`).
- `thread_read_states`, redaction, moderation, and message attachments.
- Redirects and recommendations (`POST /v1/requests/{id}/redirect`, Phase 1b).
- Any real-time layer, WebSocket, or push: the thread is fetched on load and on a ~30-second interval, per ADR-006.
- Outcomes, reputation, review cases, institution visibility.
- Changing the capacity rule itself (D-59 stays exactly as it is; only the resume check is added).
- Any change to discovery/matching (#6, deferred by D-58).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The accept path now writes two tables; a failure must not half-accept a request | One transaction, and a test that fails the mentorship insert and asserts the request is still `PENDING` with no email queued |
| A third-party read leaks a thread | One participant predicate in the repository layer, asserted by integration tests for both the mentorship and the message list, plus a row in the permission matrix |
| A new table ships without its grant, which only shows up as a runtime 500 | Hand-written `GRANT` in the migration and a probe running as `connect_app` in `database.integration.test.ts` |
| Capacity is re-based by accident while adding the resume check | D-59 is quoted in the spec as unchanged; the resume check counts `ACTIVE` mentorships only and touches no request query |
| Nine new endpoints widen the surface beyond one session | Every endpoint is listed in the proposal and traced to an FR; nothing else is added |

Rollback: delete the change's migration and the `mentorships` module, revert the `decide()` and resume edits. No existing table or column is altered, so no data migration is required backwards.

**Traces to** FR-MEN-01, FR-MEN-02, FR-THR-01, FR-THR-02, FR-SES-01, FR-SES-02, FR-REQ-03, FR-REQ-06; ADR-001, ADR-006, ADR-011; D-49, D-59; DEBT-17, DEBT-20.
