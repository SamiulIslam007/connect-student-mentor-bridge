# Design

## Repository snapshot (verified 2026-11-08, re-check at apply)

- `services/api/src/worker.ts` is 30 lines: one `worker.started` log line, a `setInterval` keep-alive, and shutdown/failure handlers. `tsup.config.ts` already emits `dist/worker.js` as a second entry.
- `compose.yaml` runs the `worker` service from the same image as `api` with `command: ["node", "dist/worker.js"]`; the container reports healthy today only because the stub never exits.
- `services/api/package.json` dependencies contain no queue library: `better-auth`, `drizzle-orm`, `nodemailer`, `pg`, NestJS, `rxjs`. Node target is `node24`.
- Migrations `0000`–`0008` live in `services/api/drizzle/`; app-role grants are hand-written per migration and probed in `database.integration.test.ts` under `SET ROLE connect_app`.
- `services/api/src/email/` provides the `EmailSender` port and an SMTP adapter; identity sends verification and reset mail directly from better-auth callbacks.
- `openspec/specs/platform/database-roles/spec.md` states `connect_app` is `NOLOGIN` and that a deployment grants it to a login role. `docs/system-architecture.md` §8.1 calls that role `app_rw` — a doc/code mismatch this change corrects in the doc.
- `docs/data-model.md` line 554 defines `outbox_events` without a dedupe key or a failure timestamp; `docs/system-architecture.md` §8.1 requires both behaviours.
- Gates today: `CI=true pnpm test` 230 pass / 0 skipped; lint, typecheck, build green.

## Goals / Non-Goals

**Goals:** one retry mechanism, one write path for side effects, and a worker that a later change can register a handler on without touching the relay.

**Non-Goals:** routing the identity library's own emails, building the request sweeper, notification preferences, or an alerting integration.

## Decisions

**D1 — Add `dedupe_key` (unique) and `failed_at` to the documented `outbox_events` columns.**
`data-model.md` gives the aggregate, payload, timing, attempt, and error columns; the at-most-once rule (INV-14) needs a unique key, and "marked failed and an alert fires" needs a durable marker.
*Rejected:* relying on `(aggregate_id, event_type)` as the key (a second legitimate event of the same type would be swallowed); a separate `outbox_failures` table (a second place to look).

**D2 — Poll-relay into pg-boss, not handler-inline processing.**
The relay selects due rows with `FOR UPDATE SKIP LOCKED`, enqueues a pg-boss job whose `singletonKey` is the event id, and marks `processed_at` after the handler resolves.
*Rejected:* running handlers inside the poll loop (no backoff, no retry state, and a slow handler blocks every other event); `LISTEN/NOTIFY` (a second delivery mechanism beside the poll, which the architecture explicitly avoids for timers).

**D3 — pg-boss is pinned and its schema is created by the migration.**
`pgboss` schema plus `GRANT USAGE, CREATE ON SCHEMA pgboss TO connect_app` in migration `0010`, matching how every other table is granted.
*Rejected:* letting pg-boss create the schema at boot (it needs `CREATE` on the database, which the application role does not get); a hand-written queue of `SELECT … FOR UPDATE` jobs (reimplements backoff badly).

**D4 — Retry budget: 5 attempts, exponential backoff from 30 seconds.**
`OUTBOX_MAX_ATTEMPTS = 5` and the backoff are code constants with env overrides, documented in the contract.
*Rejected:* unlimited retries (a permanently failing event hides behind a growing backlog); 3 attempts (a Mailpit or SMTP restart would exhaust the budget).

**D5 — The worker becomes a Nest standalone context, not a script.**
`WorkerModule` imports the database and email modules and boots with `NestFactory.createApplicationContext`, so handlers use the same DI, config, and logging as the API. `main.ts` is untouched.
*Rejected:* keeping plain functions with hand-wired imports (two ways to reach the database, and a second config loader to keep in sync).

**D6 — Only new domain events go through the queue in this change.**
The `EmailRequested` handler is the first registered handler; the identity library's verification and reset mails keep their direct path.
*Rejected:* wrapping better-auth's send callbacks in an outbox write (there is no surrounding transaction inside the library, so the event would commit separately from the token it describes).

**D7 — The test event comes from a script, not a route.**
`services/api/src/platform/outbox/test-event.ts` (script `outbox:test-event`) writes one `EmailRequested` row for a given address; the worker delivers it through Mailpit.
*Rejected:* a dev-only HTTP route (a write path in the API that must be removed before production, and one more route in the authorization matrix).

**D8 — Unknown `event_type` is a failure, not a skip.**
The registry is an explicit map; a missing key records `last_error = "unknown event type: X"`.
*Rejected:* logging and marking processed (silently drops the event, which is the exact failure mode an outbox exists to prevent).

## Assumptions

- One worker instance in the MVP; `SKIP LOCKED` makes two safe but nothing here tests multi-worker contention.
- pg-boss's own tables stay in `pgboss`; no product table references them.
- Mailpit is the observable sink in local development, so a delivered email is testable without a provider.

## Risks / Trade-offs

- **A poll interval of 5 seconds adds latency** to every notification → acceptable for email; #7's reminders run on a 5-minute sweeper as `system-architecture.md` §8.2 specifies.
- **`dedupe_key` is a hard uniqueness rule** → a caller that reuses a key for a legitimately different event loses the second one; each event type documents its key format (`<type>:<aggregate-id>:<detail>`).
- **The worker shares the API image** → a worker-only dependency grows the API image; one image is the architecture decision (ADR-016) and pg-boss is small.
- **No real alerting** → the failed row plus one error line is the whole signal; an ops dashboard is Sprint 7 work.

## Migration Plan

Additive: `0010` creates `outbox_events`, its indexes, the `pgboss` schema, and the grants. Boot order is migrate → api → worker; a worker started before the migration fails fast with a permission error instead of half-working. Rollback is a forward migration dropping the table and the schema; the worker stub body is restored by the revert.
