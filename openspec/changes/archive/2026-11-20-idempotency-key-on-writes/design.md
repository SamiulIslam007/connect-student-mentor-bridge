# Design: idempotency-key-on-writes

## Context

**Repository snapshot (verified 2026-11-20 at propose; re-check at apply).**

- `grep -rni "idempotency" packages/contracts services/api apps/web` returns nothing: no header, no store, no test. `SEC-API-7` is therefore unbuilt, and `docs/known-debt.md` carries no row for it — only `DEBT-21`, which records the message-duplication consequence.
- The three target writes, verified by decorator:
  - `POST /v1/mentorships/:id/messages` — `services/api/src/mentorships/mentorships.controller.ts:158`
  - `POST /v1/outcomes` — `services/api/src/outcomes/outcomes.controller.ts:71`
  - `POST /v1/requests` — `services/api/src/requests/requests.controller.ts:92`
- `openspec/specs/mentorship/thread-and-sessions/spec.md` ("One email is queued per message") already states "a retried request queues nothing new" and its scenario "A retry queues nothing new" asserts one message row. The code does not honour it for two distinct rows: the outbox dedupe key is the message id, so a second row queues a second email (`DEBT-21`).
- Latest migration is `services/api/drizzle/0022_futuristic_nico_minoru.sql`; this change owns `0023`.
- `services/api/test/database.integration.test.ts:47` names the table total ("the migrations create the thirty-three tables and protect the ledger") and asserts the names in **alphabetical** order.
- `services/api/test/support/database.ts:125-129` — `truncateAll()` lists its tables explicitly and does not know a new one; a table left out leaks rows between test files.
- The worker registers one queue and one cron per job (`account-sanction`, `audit-sampler`, `evidence-retention`, `reputation-counter`).
- `BodyAllowlistInterceptor` guards request **bodies** against `ROUTE_BODY_KEYS` and the OpenAPI schema; a header is outside its reach, so this change adds no body-key entry.
- Grants are hand-written onto the generated migration (`GRANT SELECT, INSERT, UPDATE, DELETE ON the table TO connect_app`), and `database.integration.test.ts` probes the new table under `SET ROLE connect_app`.
- `D-184` keeps limits (rate limits, crons, page sizes, session timeouts) in code rather than in a configuration version.

## Goals / Non-Goals

**Goals**

- A retried message post, outcome report or request creation cannot create a second fact.
- The refusal is explicit and distinguishable (reused key versus unfinished call).
- The store cleans itself up with no operator action.

**Non-Goals**

- No key on any other route; no key required.
- No change to the three handlers' own logic, transactions or audit rows.
- No UI, no client retry logic, no offline queue.
- No audit action: a replay is not a fact.

## Decisions

The owner fixed the three-write scope, the 24-hour retention and the two refusal rules. The decisions below are the ones left open.

### R1. The key is scoped to caller and operation

The unique index is `(actor_user_id, operation, key)`. Alternative rejected: a global unique key, which lets one caller's key collide with another's and turns a client-chosen string into a cross-tenant signal. `operation` is a literal (`message.create`, `outcome.report`, `request.create`) set by the decorator, not by the client.

### R2. Two retentions on one column, so a crash cannot wedge a key

`expires_at` is written as five minutes from now when the intent row is inserted and rewritten to twenty-four hours from now when the response is stored. One sweep deletes every row whose `expires_at` is earlier than the clock. Alternative rejected: one 24-hour value for both states, which leaves a crashed request answering `409 IDEMPOTENCY_IN_PROGRESS` for a day. The 5-minute window is longer than any handler here (the slowest is the outcome report's single transaction) and short enough that a client's retry succeeds without support.

### R3. The digest is canonical JSON, not raw bytes

The body is serialised with recursively sorted keys and hashed with `node:crypto` `createHash("sha256")`. Alternative rejected: hashing `rawBody`, which needs a `verify` hook on the JSON body parser — the parser is registered once in `main.ts` and widening it to keep a copy of every request body is a memory cost on every route for a check three routes need.

### R4. The status is text with a check, not a new enum

`status` is `text` with `check (status in ('IN_PROGRESS','COMPLETED'))`. Alternative rejected: a `pg_enum`, because `docs/data-model.md` §4.1 enumerates the enums the product speaks (statuses, levels, kinds); this one is plumbing that never reaches a payload, and an enum value leaking into a contract is a contract change for nothing.

### R5. An interceptor, applied by decorator on three routes

The interceptor must see the response body to store it, which a guard cannot. `@Idempotent("message.create")` on the three handlers keeps the set explicit and visible in the controller; alternative rejected: a global interceptor with a route table, which would make a new route's behaviour depend on a string match in another file.

The intent insert runs as its own autocommit statement **before** the handler, not inside the handler's transaction: the domain services own their own transactions, and an intent row that rolls back with a failed write would let a retry re-execute a write that may already have committed.

### R6. A replay writes nothing, and that is the audit story

No `IDEMPOTENCY_REPLAYED` action is added. The first call writes its own audit row inside its transaction; a replay performs no domain action and therefore appends nothing. Alternative rejected: an audit row per replay, which would put a client's retry in an append-only compliance log and grow it without a fact behind each row.

### R7. The sweep is hourly, batch 500

`IDEMPOTENCY_SWEEP_CRON = "0 * * * *"` in the pattern `D-210` set for retention, and `IDEMPOTENCY_SWEEP_BATCH = 500`. The TTLs are code constants (`IDEMPOTENCY_TTL_HOURS = 24`, `IDEMPOTENCY_IN_PROGRESS_MINUTES = 5`) because `D-184` keeps limits out of a configuration version; the apply notes the seam so a later payload can replace them.

## Acceptance criteria

1. A first `POST /v1/mentorships/{id}/messages` with a key writes one row and one email event.
2. The identical request repeated with the same key returns the same status and body, with still one row and one email event.
3. A second caller sending the same key value performs its own write.
4. The same caller repeating the key with one changed field answers `409 IDEMPOTENCY_KEY_REUSED`, and the stored response is unchanged.
5. A key whose digest matches but whose row is `IN_PROGRESS` answers `409 IDEMPOTENCY_IN_PROGRESS`.
6. A malformed key answers `422 IDEMPOTENCY_KEY_INVALID` and writes no record.
7. A request with no header behaves exactly as before and writes no record.
8. The sweep deletes a completed row older than 24 hours and an unfinished row older than 5 minutes, and leaves a young row untouched; a swept key then performs a fresh write.
9. `GET /v1/outcomes` and `POST /v1/requests` are covered by the same three behaviours (replay, reuse, expiry) at least once each.
10. The migration creates the table with its unique index, its check and its grants; the database test names thirty-four tables, lists them alphabetically, and runs the `connect_app` probe on the new table; `truncateAll()` truncates it.

## Assumptions

- The three responses fit comfortably in the JSON body cap (they are single objects; the message body cap is 2000 characters).
- A retry that arrives more than 24 hours later is a genuinely new intent, so a fresh write is correct.
- No client sends an `Idempotency-Key` today, so making the header optional leaves every existing caller untouched.

## Risks

The proposal's table covers the operational risks. The two this design adds:

- An interceptor that stores a **failed** response would make a retry replay a `500`. The design stores the response whatever its status but only after the handler returns, and a `5xx` is stored with its own short retention by treating any non-2xx as unfinished — the apply pins that branch with a test.
- A unique-violation race between two simultaneous first calls: the loser re-reads the row inside a `catch` on the unique violation and answers replay or `409`, never a raw database error. `ProblemDetailsFilter` must not be the path that surfaces it.
