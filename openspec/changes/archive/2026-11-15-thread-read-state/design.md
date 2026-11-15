# Design: thread-read-state

## Context

**Repository snapshot (verified 2026-11-15 at propose; re-check at apply).**

- Base: `main` at `c3996dd` (`origin/main` identical), working tree carries one untracked file, `docs/audit/2026-11-15-hermes-explore.md`, and nothing else. Zero active changes before this round. `openspec validate --all --strict` → 41 passed, 0 failed.
- Gates at propose: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test` 711 pass / 0 fail / 0 skipped (domain 134, contracts 23, web 245, api 309), `pnpm build` exit 0.
- `thread_messages` (`services/api/src/db/schema/mentorships.ts:76-90`) is append-only in practice: `id`, `mentorship_id` (cascade), `sender_user_id` (restrict), `body`, `created_at`, and one index `thread_messages_keyset_idx` on `(mentorship_id, created_at, id)`. Its own comment records that no read state exists "in this change" — that comment is the seam.
- Participation is resolved in the service, not the controller: `MentorshipService.read(userId, id)`, `listMessages({ userId, mentorshipId, cursor, limit })` and the rest take the caller's user id, and a non-participant gets `404` (`services/api/src/mentorships/mentorship.service.ts`, `drizzle-mentorship.service.ts`). The task for this change follows that shape rather than adding an authorization model.
- The mentorship projection is built by `mentorshipPayload()` in `mentorship.service.ts`; both `GET /v1/mentorships` and `GET /v1/mentorships/{id}` use it, so a new field added there reaches both.
- The break-glass read is a separate controller (`services/api/src/mentorships/admin-thread.controller.ts`) that never calls the participant service methods. It is the reason the marker cannot be "any read".
- Route registration duties (`AGENTS.md` rule 11): `packages/contracts/openapi.yaml`, the `MATRIX` in `services/api/test/authorization-matrix.test.ts`, `ROUTE_BODY_KEYS` in `@connect/contracts`. A new non-GET route without all three fails `pnpm test`.
- Migrations: latest is `0019_wet_war_machine.sql`; app-role grants are hand-written blocks appended to a migration (`0003_grant_profile_tables.sql`, `0006_grant_two_factor_table.sql`), never `GRANT ... TO PUBLIC`. The application role is `connect_app`.
- Rate limits are per route from `@connect/config` `RATE_LIMITS`; a write route takes `@Throttle({ default: RATE_LIMITS.write })` like `POST /v1/mentorships/{id}/messages`.

## Goals / Non-Goals

**Goals**

- A participant can learn, from the two reads they already make, how much of the thread is new to them.
- One write, one table, one pure counting rule; no message row is ever updated.
- A moderator's read provably cannot change what a participant has seen.

**Non-Goals**

- No UI, no BFF route, no nav badge (`FR-NOT-02` is separate).
- No read receipts, no presence, no per-message rows.
- No change to the thread's ordering, keyset cursor, or the break-glass projection.

## Decisions

The owner fixed the mechanism (stored monotonic marker, explicit write, API only, break-glass must not move it, cascade). The decisions below are the ones the brief left open.

### R1. The marker lives in its own table, not on `mentorships` or `thread_messages`

One `thread_read_states` row per (mentorship, user), with a unique index on the pair. Alternative rejected: two nullable columns on `mentorships` (`student_last_read_at`, `mentor_last_read_at`), which reads well today but hard-codes the two-party assumption into the mentorship row and gives a future third participant (an institution observer, a co-mentor) nowhere to live. A separate table also keeps the mentorship row's write pattern unchanged, which matters because the capacity check locks that row.

Columns: `mentorship_id` (FK, `ON DELETE CASCADE`), `user_id` (FK `users.id`, `ON DELETE CASCADE`), `last_read_at` (timestamptz, not null), timestamps. A check that `user_id` belongs to the mentorship is **not** expressible in the schema without a composite FK; participation stays a service-level predicate, exactly as it is for the thread read.

### R2. One explicit route, and no read ever writes

`POST /v1/mentorships/{id}/read`, no body, `200` with the marker and `unread_count`. Alternative rejected: marking on `GET /v1/mentorships/{id}/messages`, which would make a read non-idempotent, put a write behind every page load, and force a CSRF token and a rate-limit bucket onto a `GET` the route table describes as a read. The register's word is "read state", not "read-on-open"; a client that wants to mark does so explicitly.

### R3. The marker advances under a conditional update, not read-modify-write

`INSERT ... ON CONFLICT (mentorship_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at WHERE thread_read_states.last_read_at < excluded.last_read_at`. A stale or duplicate writer therefore cannot regress the marker, and the route stays idempotent without a lock. Alternative rejected: read then update, which is two round trips and a lost-update race for no benefit.

The instant is the database's `now()`, not the caller's clock: a client clock is attacker-controlled and a future timestamp would hide every later message.

### R4. `unread_count` is reported on the mentorship read and list, not on the message page

`mentorshipPayload()` gains `unread_count`, so both mentorship reads carry it. Alternative rejected: a count on `GET .../messages`, which is a keyset page — a count returned with a window of 20 messages answers a different question and would be wrong the moment the client pages.

The count is one aggregate: `SELECT count(*) FROM thread_messages m WHERE m.mentorship_id = $1 AND m.sender_user_id <> $2 AND m.created_at > COALESCE(marker, '-infinity')`. With no marker row, it counts every message the other party wrote, which is the honest answer for someone who has never opened the thread. The existing `thread_messages_keyset_idx` serves the predicate.

### R5. The pure rule is a domain function with the row shapes it needs

`packages/domain` gains one pure helper (unread from a message count and a marker) so the API's SQL and the rule cannot drift, in the pattern `responseReliability` set (D-114). The SQL stays the authority; a test pins the API number to the pure function on the same rows.

### R6. A new table gets its own grant block in the same migration

`GRANT SELECT, INSERT, UPDATE ON "thread_read_states" TO connect_app` — no `DELETE` for the application role, because the row is removed only by the cascade. `docs/data-model.md` INV-05 records the grant.

## Migration and rollback

- **Migration `0020`**: `CREATE TABLE "thread_read_states"` with its two FKs, the unique index on `(mentorship_id, user_id)`, the primary key, and the grant block. Forward-only, as every migration in this repo is.
- **No backfill.** An absent marker is a defined state (R4), so existing mentorships need no rows.
- **Rollback**: the table is derived convenience data; dropping it loses only "where I had read to". Reverting the route and the payload field first is enough to make the system behave exactly as it does today.
- **Reversibility**: `git revert` of the migration is not the repo's pattern; the forward-only fix is a `DROP TABLE` migration if the feature is withdrawn before the pilot.

## Risks and what must fail closed

- **Fail closed**: the mark-read write must refuse a non-participant with `404` and write nothing; the unread query must never include a message the caller wrote; the break-glass path must never call `markRead`. Each has a test that fails if the guard is removed.
- A migration that grants `DELETE` to the application role would let a caller erase their own read history; the grant block is narrower on purpose.
- The new route must carry a rate-limit bucket; omitting it leaves an unthrottled write (the `AGENTS.md` rule 13 duty).
