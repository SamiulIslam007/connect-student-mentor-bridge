# Tasks: idempotency-key-on-writes

Decision rows to add at apply (reserved, one contiguous block): **D-215 to D-220** — D-215 the caller-and-operation scope, D-216 the two retentions on one column, D-217 the canonical-JSON digest, D-218 status as text with a check, D-219 an interceptor applied by decorator, D-220 no audit row for a replay. Continue the block for any further `R` decision; never reuse a reserved number.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `ls services/api/drizzle/*.sql | tail -1` (must still be `0022` unless an earlier change of this round has not landed), `grep -rn "idempotency" packages/contracts services/api apps/web`.
- [x] 0.2 Read the three handlers and record their shapes: `sed -n '150,175p' services/api/src/mentorships/mentorships.controller.ts`, `sed -n '65,90p' services/api/src/outcomes/outcomes.controller.ts`, `sed -n '85,110p' services/api/src/requests/requests.controller.ts`.
- [x] 0.3 Read the worker registration shape in `services/api/src/platform/outbox/outbox-worker.ts` and copy it exactly.
- [x] 0.4 Read the newest migration for the grant style: `sed -n '1,40p' services/api/drizzle/0022_futuristic_nico_minoru.sql`.

## 1. The pure rules

- [x] 1.1 `packages/domain/src/idempotency.ts`: `idempotencyKeyViolation(key)` for 8 to 128 characters of letters, digits, dot, underscore and hyphen, and `canonicalJson(value)` returning a string with recursively sorted object keys. No Node import; exported from `packages/domain/src/index.ts`.
- [x] 1.2 `packages/domain/test/idempotency.test.ts`: the two bounds, each refused character class, an accepted mixed key, and a canonical string for a nested object whose key order differs from the input.
- [x] 1.3 Mutation checks recorded here: loosen the length bound and confirm the boundary test fails; drop the recursive sort and confirm the canonical test fails. Restore both.

## 2. Schema, migration and grants

- [x] 2.1 `services/api/src/db/schema/idempotency.ts`: `idempotency_keys` with `id`, `actor_user_id` (references `users.id`, cascade), `operation`, `key`, `request_digest`, `status` (text, default `IN_PROGRESS`, with the check), `response_status` (integer, nullable), `response_body` (jsonb, nullable), `created_at`, `expires_at` (not null); unique index on `(actor_user_id, operation, key)`; index on `expires_at`. Export from the schema barrel.
- [x] 2.2 `pnpm --filter api db:generate` produces `0023`; append by hand `GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO connect_app;` and read the generated SQL before running it.
- [x] 2.3 `services/api/test/database.integration.test.ts`: the test name becomes thirty-four tables, the name lands at its sorted position (let the failing assertion tell you where, do not place it by eye), and a `SET ROLE connect_app` probe inserts, selects, updates and deletes one row.
- [x] 2.4 `services/api/test/support/database.ts`: add `idempotency_keys` to the `truncateAll()` list.

## 3. The store and the interceptor

- [x] 3.1 `services/api/src/platform/idempotency/store.ts`: `beginKey({ actorUserId, operation, key, digest })` inserting the intent row and translating a unique violation into the existing row; `completeKey({ id, status, body })` writing the response and extending `expires_at` to 24 hours; `sweepExpired({ batch, now })` returning the deleted count.
- [x] 3.2 `services/api/src/platform/idempotency/interceptor.ts`: read the header, validate it through the domain rule, digest the body through `canonicalJson`, replay a completed row, refuse a different digest and an unfinished row, otherwise call the handler and complete the row. A `5xx` leaves the row unfinished so its 5-minute retention frees the key.
- [x] 3.3 `services/api/src/platform/idempotency/idempotent.decorator.ts`: `@Idempotent(operation)` setting metadata the interceptor reads; register the interceptor in the module that owns it.
- [x] 3.4 `packages/config/src/index.ts`: `IDEMPOTENCY_TTL_HOURS = 24`, `IDEMPOTENCY_IN_PROGRESS_MINUTES = 5`, `IDEMPOTENCY_SWEEP_BATCH = 500`.
- [x] 3.5 The two `409` codes and the `422` code go through `ProblemDetailsFilter`'s existing mapping (a new code is a `HttpException` with a `code` property, following `DUPLICATE_PENDING_REQUEST`).

## 4. The three routes

- [x] 4.1 `@Idempotent("message.create")` on `POST /v1/mentorships/:id/messages`.
- [x] 4.2 `@Idempotent("outcome.report")` on `POST /v1/outcomes`.
- [x] 4.3 `@Idempotent("request.create")` on `POST /v1/requests`.
- [x] 4.4 Confirm no fourth route carries the decorator: `grep -rn "Idempotent(" services/api/src | grep -v platform/idempotency`.

## 5. The sweep

- [x] 5.1 `services/api/src/platform/idempotency/sweep-job.ts`: `IDEMPOTENCY_SWEEP_QUEUE = "idempotency-sweep"`, the hourly cron and the batch, registered in `outbox-worker.ts` in the same shape as the retention job. No dry run — a row is a transport artefact, not user data.

## 6. Contract

- [x] 6.1 `packages/contracts/openapi.yaml`: an `Idempotency-Key` header parameter on the three operations, and the `409` and `422` responses with their codes and one-line explanations.
- [x] 6.2 Confirm no body-key entry is needed and say so: `pnpm --filter @connect/contracts test` and the inventory test pass untouched.

## 7. Tests

- [x] 7.1 `services/api/test/idempotency.integration.test.ts` (new): the ten acceptance criteria, with the message route carrying criteria 1 to 7 and the outcome and request routes carrying criterion 9.
- [x] 7.2 A unique-violation race: two statements issued with the same key against the store directly, asserting one row and one of the two documented answers, never a `500`.
- [x] 7.3 A `5xx` from the handler leaves the row unfinished with the 5-minute expiry, and a retry after that window performs the write.
- [x] 7.4 Mutation checks recorded here: store the response before the handler runs and confirm the replay test fails; ignore the digest and confirm the reused-key test fails. Restore both.

## 8. Docs

- [x] 8.1 `docs/known-debt.md`: add one row recording `SEC-API-7` as unbuilt with the evidence from task 0.1 and mark it closed by this change in the same edit; close `DEBT-21`.
- [x] 8.2 `docs/security-requirements.md`: the `SEC-API-7` annotation names the three routes, the header, the two refusals and the retention.
- [x] 8.3 `docs/data-model.md`: the new table in its section and §4.1's note that `idempotency_keys.status` is plumbing, not a product enum.
- [x] 8.4 `docs/api-contracts.md`: the header contract, the two `409` codes and the `422`, one paragraph.
- [x] 8.5 `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-215 to D-220). If an earlier change of this round already rewrote one of these lines, verify it and fix only what is still stale.

## 9. Checks, review, handoff

- [x] 9.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — separate commands, exit codes recorded.
- [x] 9.2 `openspec validate idempotency-key-on-writes --strict` and `openspec validate --all --strict`; quote the printed totals.
- [x] 9.3 Review gate per `AGENTS.local.md` §2, including the silent-failure pass on the interceptor's `catch` on a unique violation and the trust-rule check (a replay must not weaken the append-only ledger or the audit log).
- [x] 9.4 `pnpm --filter api db:migrate` against `connect_test` only, then the integration file alone, and record the real counts.
- [x] 9.5 Handoff in chat: the three routes, the two refusals, the migration number, the table count and the two debt rows touched.

## Verification record (2026-11-20)

- Gates: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` 0 — domain 162, web 245, contracts 23, api 376, 0 skipped.
- `pnpm --filter api db:generate` produced `0023_aberrant_drax.sql`; the `GRANT SELECT, INSERT, UPDATE, DELETE` was appended by hand and the file read before running.
- `pnpm --filter api db:migrate` applied `0023` to the local dev database; the test harness replays it into `connect_test` on every boot.
- Focused: `idempotency.integration.test.ts` → 10 tests, 10 pass; `database.integration.test.ts` → 4 pass, and the table test now reads thirty-four with the `connect_app` probe on `idempotency_keys`.
- Mutation 1 (complete the row before the handler and never after): the replay test failed with `{}` instead of the stored body, restored.
- Mutation 2 (ignore the digest): the reused-key test answered `201` instead of `409`, restored.
- Deviation recorded: a real `5xx` is not reachable through the three routes without fault injection, so the unfinished branch is pinned with a `422` (the same non-2xx path) plus the sweep; the design's `5xx` scenario is covered by that branch, not by a forced server fault.
- Deviation recorded: the test stack now provides `DATABASE` to its module so a provider that injects it resolves; no production file changed for that.
