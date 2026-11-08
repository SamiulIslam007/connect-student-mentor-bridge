# Tasks

## 1. Outbox storage

- [ ] 1.1 Add `services/api/src/db/schema/platform.ts` with the `outbox_events` table (`dedupe_key` unique, `failed_at`, checks on `attempts >= 0`), its indexes on (`processed_at`, `available_at`) and on `dedupe_key`, and export it from `schema/index.ts` — verify `pnpm --filter api typecheck` passes and `drizzle-kit generate` emits one migration containing only this table
- [ ] 1.2 Append the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON outbox_events TO connect_app` and the `CREATE SCHEMA IF NOT EXISTS pgboss; GRANT USAGE, CREATE ON SCHEMA pgboss TO connect_app` statements to that migration — verify the migration applies to a fresh database and to the existing `connect` database without error
- [ ] 1.3 Extend the `SET ROLE connect_app` probe in `services/api/test/database.integration.test.ts` to insert, select, and update an outbox row — verify `CI=true pnpm --filter api test database` passes with the probe exercising all three

## 2. Queue and worker process

- [ ] 2.1 Add `pg-boss` to `services/api/package.json` at one exact version, then boot a queue inside a NestJS standalone context — verify `pnpm install` and `pnpm --filter api build` succeed and `dist/worker.js` starts a process that connects as `connect_app` and exits non-zero when the database is unreachable
- [ ] 2.2 Replace the `worker.ts` stub with `WorkerModule` (`NestFactory.createApplicationContext`), keeping the structured `worker.started` / `worker.stopped` / `worker.failed` log lines and the `SIGTERM` shutdown — verify `docker compose up -d worker` reports healthy and `docker compose stop worker` logs a clean stop with exit code 0
- [ ] 2.3 Add the relay: select due unprocessed rows with `FOR UPDATE SKIP LOCKED`, enqueue one job per row with `singletonKey = event id`, set `processed_at` after the handler resolves, and record `attempts`/`last_error` on failure respecting `OUTBOX_MAX_ATTEMPTS` and the backoff — verify integration tests cover success, a throwing handler, a row whose `available_at` is in the future, and the attempt limit reaching `failed_at`

## 3. Writers and handlers

- [ ] 3.1 Add `enqueueOutboxEvent(tx, { aggregateType, aggregateId, eventType, payload, dedupeKey, availableAt? })` in the same module, returning whether a row was inserted, and reuse it as the only write path — verify a unit test asserts a duplicate `dedupe_key` inserts nothing and does not raise
- [ ] 3.2 Add the handler registry with `EmailRequested` wired to the existing `EmailSender` port and structured logging — verify an integration test asserts one email is sent for one event and that a redelivered event sends none
- [ ] 3.3 Make an unknown `event_type` a recorded failure — verify an integration test inserts `RequestAcepted` and asserts the row stays unprocessed with a `last_error` naming the type and the worker still polling
- [ ] 3.4 Add `services/api/src/platform/outbox/test-event.ts` and the `outbox:test-event` script that writes one `EmailRequested` row — verify the command prints the event id, the row appears in `outbox_events`, and running it twice with the same key writes one row

## 4. Docs

- [ ] 4.1 Update `docs/data-model.md` §5.6/§7 with `dedupe_key` and `failed_at` and the index, and `docs/system-architecture.md` §8.1 to name `connect_app` instead of `app_rw` — verify `grep -n "app_rw" docs/*.md` returns nothing and the table description matches the merged schema
- [ ] 4.2 Narrow `DEBT-11` in `docs/known-debt.md` (identity mail still direct), and update `docs/mvp-build-plan.md` §5 row 6a and `docs/milestones-and-phases.md` Current state — verify each statement matches the merged code
- [ ] 4.3 Add the test-event command to `docs/local-setup.md`, including how to read the delivered message in Mailpit — verify the commands run as written against the local stack

## 5. Integration checks

- [ ] 5.1 Run `CI=true pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and report per-package counts — verify 0 failures, 0 skipped, and the total above today's 230
- [ ] 5.2 Run the test event against the running stack, break the SMTP host once to observe a retry and then `failed_at`, and restore it — verify Mailpit shows exactly one delivered message and the retry is visible in the row's `attempts`
- [ ] 5.3 Run the review gate (`verify-before-done`, `/ponytail-review`, `/ce-code-review`, `silent-failure-hunter`, trust-rule check, `/ponytail-debt`) and record the findings — verify every finding is fixed in scope or reported as debt

## Workflow follow-up

- Archive the change after the owner approves the review, then verify the archive and the merge.
