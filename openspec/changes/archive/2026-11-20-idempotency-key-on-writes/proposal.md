# Proposal: idempotency-key-on-writes

## Why

`SEC-API-7` is a Must — "retryable writes accept an `Idempotency-Key` and are safe to repeat" — and the string `idempotency` appears nowhere in `packages/contracts`, `services/api` or `apps/web`. `DEBT-21` records the consequence for one route: a retried message post writes a second `thread_messages` row and queues a second email. `openspec/specs/mentorship/thread-and-sessions/spec.md` already claims "a retried request queues nothing new", so today a spec requirement is true only on paper. The register has no debt row for the Must itself, which is why it reads as done.

## What Changes

- One new table `idempotency_keys` (migration **0023**) plus its `connect_app` grants, keyed on the caller, the operation and the client's key, holding the request digest, the response status and the response body.
- One Nest interceptor applied to **exactly three writes**: `POST /v1/mentorships/{id}/messages`, `POST /v1/outcomes`, `POST /v1/requests`. The header is optional; a request without it behaves exactly as today.
- A repeat of the same key with the same body replays the stored response and performs no write; the same key with a different body is `409 IDEMPOTENCY_KEY_REUSED`; a repeat while the first call is unfinished is `409 IDEMPOTENCY_IN_PROGRESS`.
- A 24-hour retention on a completed record and a 5-minute retention on an unfinished one, swept by one hourly queue (`idempotency-sweep`) on the existing worker.
- `packages/contracts/openapi.yaml` documents the header on the three operations and the two `409` responses.

## Capabilities

### New Capabilities

- `platform/idempotency`: the header contract, the replay rule, the digest mismatch rule, the retention of a stored response.

### Modified Capabilities

None. `mentorship/thread-and-sessions` already states the outcome this change makes true ("a retried request queues nothing new"), so restating it would duplicate the requirement that archive then has to reconcile; the proposal records the code gap instead.

## Impact

- **Code**: `services/api/src/platform/idempotency/*` (the interceptor, the store, the sweep, the decorator), `services/api/src/mentorships/mentorships.controller.ts`, `services/api/src/outcomes/outcomes.controller.ts`, `services/api/src/requests/requests.controller.ts` (one decorator each), `services/api/src/platform/outbox/outbox-worker.ts` (one queue and one cron), `services/api/src/db/schema/idempotency.ts`, `packages/domain/src/idempotency.ts`, `packages/config/src/index.ts`.
- **Contract**: `packages/contracts/openapi.yaml` — one header parameter on three operations, two `409` responses. No new path, so no new MATRIX row, no new `ROUTE_BODY_KEYS` entry.
- **Data**: migration `0023` creates `idempotency_keys`; the table count in `services/api/test/database.integration.test.ts:47` becomes thirty-four and `truncateAll()` gains the table.
- **Dependencies**: none. `node:crypto` `createHash` is standard library.
- **Tests**: `packages/domain/test/idempotency.test.ts`, `services/api/test/idempotency.integration.test.ts` (new), `services/api/test/database.integration.test.ts` (table list and name).
- **Docs**: `docs/data-model.md` §4.1 and the new table, `docs/api-contracts.md`, `docs/known-debt.md` (one row recording `SEC-API-7` as unbuilt today, closed by this change, plus `DEBT-21` closed), `docs/security-requirements.md` (`SEC-API-7` annotation), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

None functionally. It owns migration `0023`: no other change in this round may add a migration, so `institution-dashboard-aggregates` can land before or after it, and any later change in the round must take `0024`.

## Out of scope

- **Every other write.** Sign-in, accept/decline, outcome confirm, evidence upload and the admin routes stay unkeyed; widening the set is a second decision, and the three chosen writes are the ones that create a fact a retry can duplicate.
- **A uniqueness index instead of a header.** `DUPLICATE_PENDING_REQUEST` already covers the request pair case; it cannot cover a message.
- **Storing a response larger than the existing payload caps.** The three responses are bounded by the JSON body cap; no truncation path is built.
- **Client-side retry**, offline queueing (`DEBT-49`) and a UI disclosure that a write was replayed.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A stuck `IN_PROGRESS` row blocks a key for 24 hours | The unfinished retention is 5 minutes, and the sweep deletes it, so a crashed request frees its key on the next hourly run at the latest; a test asserts the 5-minute expiry |
| The digest disagrees with itself between two identical bodies (key order, whitespace) | The digest is taken over a canonical JSON serialisation (recursively sorted keys), and a test replays a body whose keys are reordered |
| The store table grows unbounded | 24-hour retention, one hourly sweep with a batch bound, and an index on `expires_at` |
| The interceptor reads a body it does not own and breaks streaming or the body cap | It reads the already-parsed body only, adds no parser, and the existing `BodyAllowlistInterceptor` and 100 KiB cap stay in front of it untouched |
| A replay returns a stale response that no longer matches state | A replay is only served within 24 hours and only for the same digest; the operation names are the three creates, whose stored response is a fact, not a projection |

**Rollback**: delete the interceptor application (three decorators), drop the queue registration, and leave the table in place — an idle table with a TTL sweep is harmless. The migration is forward-only; a revert needs `DROP TABLE idempotency_keys`, which is safe because nothing else references it.

**Traces to** SEC-API-7, DEBT-21, DEBT-49, FR-REQ-02, D-184.
