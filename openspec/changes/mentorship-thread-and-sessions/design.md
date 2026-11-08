# Design: mentorship-thread-and-sessions

## Repository snapshot (verified 2026-11-08, re-check at apply)

- `services/api/src/requests/drizzle-requests.service.ts` is 522 lines; `decide()` spans lines 399-493 and already runs inside `this.db.transaction(...)`, reading participants and enqueueing one outbox email before returning.
- `services/api/src/requests/request-sweeper.ts` (129 lines) is the existing timer/sweeper pattern: a bounded select, a conditional update, and an outbox enqueue per affected row, safe to run repeatedly.
- `services/api/src/db/schema/requests.ts` (67 lines) shows the house style: `pgTable` with `...timestamps`, `check(...)`, `uniqueIndex(...).where(...)`, `index(...)`.
- `services/api/src/db/schema/enums.ts` declares `request_status`, `interaction_type`, `outcome_type`, `role`, and others; there is no mentorship or session enum today.
- `services/api/drizzle/` holds `0000`-`0011`; `0011_workable_silver_sable.sql` ends with a hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mentorship_requests" TO connect_app;`.
- `services/api/test/database.integration.test.ts:47` asserts "the migrations create the twenty tables" and compares the full table list; `services/api/test/authorization-matrix.test.ts:31` defines the `MATRIX` interface and every registered route must appear in it.
- `services/api/test/support/api-stack.ts` (243 lines) builds the Nest test stack with a hand-rolled provider list per controller.
- `apps/web/lib/bff.ts` (196 lines), `apps/web/lib/api.ts` (82 lines), and `apps/web/app/api/requests/[id]/[action]/route.ts` are the BFF pattern to copy; `apps/web/lib/strings.ts` (296 lines) is the only string source.
- `packages/contracts/openapi.yaml` currently declares 31 `/v1/...` paths, none for mentorships.
- Gates on 2026-11-08: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `openspec validate --all --strict` 24/24. `pnpm test` was NOT run in this pass (it writes to `connect_test`).
- `docs/data-model.md` §5.3-5.4 and `docs/api-contracts.md` §5.5 already describe these tables and endpoints; this change implements that text rather than inventing a shape.

## Goals / Non-Goals

**Goals**

- Close DEBT-20 in one transaction, so no accepted request can exist without its mentorship.
- Make the thread, the agreement, and the session records real, participant-only, and testable.
- Add the `DEBT-17` resume check without touching the D-59 capacity rule.

**Non-Goals**

- Any asynchronous mentorship creation, event sourcing, or second write path.
- Message editing, redaction, read receipts, attachments, or notifications beyond one email per message.
- Applying the agreement to eligibility or completing a mentorship's outcome window; the outcome ledger owns that later.

## Decisions

**D1 — Create the mentorship inside `decide()`'s existing transaction.** The row is inserted immediately after the conditional status update, so `ACCEPTED` and the mentorship exist or neither does. Rejected: enqueueing a `MentorshipCreated` event and letting the worker insert. An async insert leaves accepted requests without a mentorship whenever the worker is behind, which is the exact state DEBT-20 describes, and #9 would then need to poll for it.

**D2 — The mentorship copies `field_id` from the request and fixes `is_paid` false.** Reputation is field-scoped, so the field must be frozen at acceptance rather than re-read from the mentor's profile later. `is_paid` has no writer in the MVP (owner decision, payments are Phase 3); it exists so the paid-relationship rule has one column to read when payments land. This is an inert column, stated as such in the spec's description.

**D3 — Thread rows are immutable text.** `thread_messages` stores `mentorship_id`, `sender_user_id`, `body`, and timestamps; no read state, no redaction columns in this change, because moderation and read receipts have no surface until Sprint 7. Rejected: adding `redacted_at`/`thread_read_states` now — they would ship with no reader (D-47).

**D4 — One outbox email per message, enqueued in the message transaction.** Dedupe key `email:thread-message:<message id>`, template `thread-message`, body names the sender and links to the mentorship and carries no other message's text. Rejected: a digest (explicitly out of scope per the owner's cross-cutting decision) and a notify-after-commit job (a lost commit hook loses the mail silently).

**D5 — Session state is `SCHEDULED`, `HELD`, `CANCELLED` with one confirmation timestamp per party.** Held is derived from both timestamps being set, and the status is written only by that transition. Rejected: a `confirmed_by` array or a boolean — a boolean cannot say who confirmed, and the confirmation is the evidence the pilot cares about.

**D6 — No idempotency-key store in this change.** Double accept is refused by the existing conditional update; a double message post is deduplicated only in its email. A retried identical body therefore creates a second message row. Rejected: adding an `Idempotency-Key` table and middleware — no other endpoint has one, and inventing the mechanism here would set the pattern for the whole API outside any approved change. Recorded as a known-debt row (DEBT-21) instead.

**D7 — The resume check counts live mentorships under the mentor-profile row lock.** `CAPACITY_BELOW_ACTIVE` is a new `409` code; the count is `mentorships.status = 'ACTIVE'` for the mentor, compared with `weekly_capacity`, and the mode is only written when the check passes. D-59's request-based count is untouched, so a mentor can have an accepted request that has no mentorship only in the rollback path. Rejected: re-basing capacity on mentorships — that is a decision the owner explicitly deferred.

**D8 — Non-participants get `404`, never `403`.** A `403` would confirm that a mentorship id exists. Every mentorship route resolves the caller's participation first and throws `SESSION_NOT_FOUND` otherwise, matching the request controller's choice.

**D9 — Module shape mirrors `requests/`.** `mentorship.service.ts` (interface + payload mapper), `drizzle-mentorship.service.ts` (queries), `mentorships.controller.ts`, `mentorships.tokens.ts`, `mentorships.module.ts`. Rejected: putting the endpoints on `RequestsController` — it would mix two aggregates and force every request test stack to grow the new dependency, which is the documented DI pitfall.

**D10 — Two new state errors only.** `MENTORSHIP_INVALID_STATE` (a transition attempted from a terminal or wrong state) joins the problem catalog; `SESSION_NOT_FOUND` and `FORBIDDEN` already exist. No new code for "not a participant".

## Data model

| Table | Columns | Constraints |
|---|---|---|
| `mentorships` | `id`, `request_id` (unique, FK → `mentorship_requests`, restrict), `student_profile_id`, `mentor_profile_id`, `field_id`, `status`, `cadence?`, `planned_weeks?`, `goal?`, `student_ack_at?`, `mentor_ack_at?`, `is_paid` (default false), `started_at`, `ended_at?`, `ended_by_user_id?`, `created_at`, `updated_at` | unique `request_id`; check `is_paid = false`; check `planned_weeks` 1-52 when present; check `ended_at >= started_at` when present; partial index on (`mentor_profile_id`, `status`) for the resume count |
| `thread_messages` | `id`, `mentorship_id`, `sender_user_id`, `body`, `created_at` | index (`mentorship_id`, `created_at`, `id`) for the keyset scan; no `updated_at`, because rows are immutable |
| `mentorship_sessions` | `id`, `mentorship_id`, `created_by_user_id`, `scheduled_start`, `duration_minutes`, `meeting_url`, `status`, `student_confirmed_held_at?`, `mentor_confirmed_held_at?`, `cancelled_by_user_id?`, `cancel_reason?`, `created_at`, `updated_at` | check `meeting_url LIKE 'https://%'`; check `duration_minutes` between 15 and 240; check `status = 'HELD'` implies both confirmation timestamps are set; index (`mentorship_id`, `scheduled_start`) |

Enums: `mentorship_status` (`ACTIVE`, `COMPLETED`, `ENDED_EARLY`), `mentorship_cadence` (`WEEKLY`, `BIWEEKLY`, `MONTHLY`, `AD_HOC`), `mentorship_session_status` (`SCHEDULED`, `HELD`, `CANCELLED`).

Grant: the generated migration gets one hand-written line per new table, `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "<table>" TO connect_app;` — no append-only treatment here, because these rows are ordinary mutable product data. `services/api/test/database.integration.test.ts` gains the three tables in its asserted list, the "twenty" in the test title becomes "twenty-three", and each new table gets its `SET ROLE connect_app` probe.

## API surface

| Method and path | Roles | Notes |
|---|---|---|
| `GET /v1/mentorships?status=` | S, M | Own mentorships, newest first, capped page |
| `GET /v1/mentorships/{id}` | participant | `404` otherwise |
| `PUT /v1/mentorships/{id}/agreement` | participant | `cadence`, `planned_weeks`, `goal` |
| `POST /v1/mentorships/{id}/agreement/acknowledge` | participant | sets the caller's timestamp only |
| `GET /v1/mentorships/{id}/messages?cursor=&limit=` | participant | oldest first, keyset (`created_at`, `id`) |
| `POST /v1/mentorships/{id}/messages` | participant | text body, `422` on empty/over-length |
| `POST /v1/mentorships/{id}/sessions` | participant | `https` URL, start, duration |
| `POST /v1/sessions/{id}/confirm-held` | participant | sets the caller's timestamp; flips to `HELD` when both are set |
| `POST /v1/mentorships/{id}/complete` | participant | `ACTIVE` → `COMPLETED` once |

## State transitions

- `mentorships.status`: `ACTIVE` → `COMPLETED` (participant, once) or `ENDED_EARLY` (not exposed in this change; the column accepts it for the admin path later).
- `mentorship_sessions.status`: `SCHEDULED` → `HELD` (both confirmations) or `CANCELLED` (either participant, with a reason). `HELD` and `CANCELLED` are terminal.

## Background jobs

None new. The message email rides the existing outbox worker (`services/api/src/platform/outbox/outbox-worker.ts`); the resume check is synchronous. The sweeper is untouched.

## Failure and edge cases

- Accept where the mentorship insert violates the unique `request_id`: the transaction rolls back, the request stays `PENDING`, and the caller sees a retriable `500`-class problem (not a success).
- Post to a mentorship whose request was later withdrawn: impossible, because withdrawal only applies to `PENDING`; a completed mentorship still accepts messages (the thread is the record), which is stated in the spec only as participant access, not as a lifecycle rule.
- Session with both confirmations arriving concurrently: the second update reads the first timestamp under a row lock, so `HELD` is written once.
- Resume for a mentor with zero mentorships: allowed, since `0 < weekly_capacity` (capacity is at least 1 by profile validation).

## Risks / Trade-offs

- Two tables written per acceptance → mitigated by one transaction and the rollback test.
- Thread email volume is one per message → accepted; the owner chose no digest.
- Duplicate message on client retry → recorded as DEBT-21 rather than building an idempotency store here.
- New module + 9 endpoints in one session → the task list splits them by capability so a partial branch still compiles.

## Migration plan

`0012` is additive: three tables, three enums, indexes, checks, and three grants. No existing table or column changes, so no backfill and no downtime. Rollback is dropping the three tables and the enums; the request, profile, and outbox tables are unaffected.

## Open questions

- Whether `ENDED_EARLY` needs a participant-facing route before the pilot: this change only allows it as a stored value.
- Whether the message length bound should be 2 000 characters (the request's `context_summary` bound) or larger: this design assumes 2 000 and the spec states "the documented maximum", so the number can be set in the contract without a spec change.
