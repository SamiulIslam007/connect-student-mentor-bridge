# Proposal

## Why

Nothing in the system can run after the request returns. `services/api/src/worker.ts` is a keep-alive stub that logs `worker.started` and waits, so no reminder, expiry, or retry mechanism exists, and SMTP failures are only logged (`DEBT-11`). Change #7's 48-hour expiry and 24-hour reminder are the first real customer, and they cannot be built on a process that does nothing.

## What Changes

- Add the `outbox_events` table (`aggregate_type`, `aggregate_id`, `event_type`, `payload`, `dedupe_key`, `available_at`, `processed_at`, `attempts`, `failed_at`, `last_error`), its indexes, and the hand-written `connect_app` grant.
- Add `pg-boss` as a pinned dependency and create its `pgboss` schema in the migration, granted to `connect_app`, so the worker can boot without owner rights.
- Replace the worker stub with a NestJS standalone application context that (a) polls unprocessed outbox rows and enqueues one pg-boss job per row, (b) marks a row processed only after its handler resolves, (c) runs the email handler through the existing `EmailSender` port, and (d) shuts down cleanly on `SIGTERM`.
- Add `enqueueOutboxEvent(tx, event)` as the one way a state change writes a side effect, in the same transaction as the change itself.
- Add a script that writes the milestone's test event so a queued email can be delivered, and retried, against Mailpit.
- Update `docs/known-debt.md` (`DEBT-11` narrows to the library-sent verification and reset mail), `docs/system-architecture.md` §8.1 (the code's role name, `connect_app`, not `app_rw`), and `docs/data-model.md` (the two columns this change adds).

## Capabilities

### New Capabilities

- `platform/outbox-and-job-runner`: an outbox row written in the same transaction as every side effect, a worker that relays it to a retrying queue, and idempotent handlers that a later change can register against. Traces to FR-NOT-01, NFR-REL-01, INV-14, ADR-006, ADR-016.

### Modified Capabilities

None. The grant and the schema this change adds are new behavior, not a change to an existing requirement of `platform/database-roles`, so they live in the new capability.

## Impact

- **Code:** `services/api/src/platform/outbox/` (event writer, relay, handler registry, email handler), a `WorkerModule` replacing `src/worker.ts`'s stub body, `services/api/src/db/schema/platform.ts`, `services/api/src/db/seed/…` untouched, `tsup` entry unchanged (`worker` already builds).
- **Data:** one migration (`0010`) adding `outbox_events` and the `pgboss` schema with its grant. No existing row changes.
- **Config:** `OUTBOX_POLL_INTERVAL_MS` (default 5000) and `OUTBOX_MAX_ATTEMPTS` (default 5) as code constants with env overrides, following the existing config module shape.
- **Dependencies:** `pg-boss`, pinned to the exact version resolved at apply.
- **Docs:** `docs/system-architecture.md` §8.1, `docs/data-model.md` §5.6/§7, `docs/known-debt.md`, `docs/mvp-build-plan.md` §5 row 6a, `docs/milestones-and-phases.md` Current state, `docs/local-setup.md` (the test-event command).

## Out of scope

- **Routing the verification and reset emails through the queue.** They are sent inside better-auth's own callbacks with no surrounding transaction; they keep the direct send path and `DEBT-11` narrows rather than closes. The queued path exists for every later domain event.
- **The request sweeper itself** (#7), any notification preferences, `notifications`/`email_suppressions` tables (Phase 1b), and any alerting integration: a failed event logs one structured error line, which is the MVP's alert.
- **A dev HTTP endpoint** for the test event: the script writes the row directly, so the API keeps no write path that later has to be removed.
- **Multiple workers or partitioned queues**: one relay, one queue name, `SKIP LOCKED` on the poll.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An event is enqueued twice and the email goes out twice | `dedupe_key` is unique in the table and `processed_at` is set under `SKIP LOCKED`; the email handler also passes the same key to Mailpit-visible headers so a duplicate is observable in a test |
| The worker processes an event whose handler is missing after a partial deploy | Unknown `event_type` fails loudly (row stays unprocessed with an error), instead of being marked processed and lost |
| pg-boss creates its schema with owner rights in one environment and fails on `connect_app` elsewhere | The migration creates the schema and grants it; the worker test boots as `connect_app` and proves it |
| A poll loop that dies silently stops all reminders | The relay logs every empty poll cycle at debug and every failure at error; #7's sweeper tests assert the reminder path end to end, so a dead relay fails a test |

**Rollback:** revert the change and run a forward migration that drops `outbox_events` and the `pgboss` schema. The worker returns to the stub, which no feature depends on yet.

**Traces to** FR-NOT-01, NFR-REL-01, INV-14, FR-REQ-05 (consumer), ADR-006 (pg-boss, provisional), ADR-016 (one image, two commands), D-58.
