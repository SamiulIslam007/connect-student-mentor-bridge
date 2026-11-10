# Design: abuse-reports-and-sanctions

## Repository snapshot (verified 2026-11-10, re-check at apply)

- `main` at `1d19545`; last migration `0015_wealthy_red_ghost.sql`. **Next free migration number is whatever `drizzle-kit generate` emits at apply time**; do not write a number into these artifacts.
- `services/api/src/identity/better-auth-identity.service.ts:604 suspendAccount()` already runs in one transaction: `UPDATE users SET status='SUSPENDED'`, `DELETE FROM sessions WHERE user_id = …`, and one `auditLogs` insert with `actorRole: "PLATFORM_ADMIN"` and the reason. Its comment says "Same transaction as the status change". Nothing calls it outside `identity.integration.test.ts` (lines 512, 548, 587, 685).
- `signIn()` (`:370`) calls the library, then re-reads the account with `requireAccount(result.user.id)` at `:432` "because the hook may have moved it to ACTIVE" — it re-reads but does **not** re-check the status. The status refusal lives in the library hook (`statusRefusal`, used at `:387`). That gap is `DEBT-09`.
- `services/api/src/outcomes/review-queue.controller.ts` is the admin route pattern: `@Controller("v1/review-queue")`, `requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, cursor validation, `{ data, next_cursor }`.
- `packages/contracts/src/body-keys.ts` keys use the `:id` form (`POST /v1/requests/:id/accept`), while `openapi.yaml` uses `{id}`; `packages/contracts/test/openapi.test.ts` asserts parity between the two.
- `services/api/test/authorization-matrix.test.ts` `MATRIX` lists every registered route with `access` and a `mutating` flag; a registered route missing from it fails the test.
- `services/api/src/db/schema/auth.ts` holds the library-native `users` table; project columns (`timezone`, `status`, `age18Plus`, `anonymizedAt`) are declared `input: false` so the library never accepts them from a body. `suspended_until` follows the same rule.
- `services/api/src/email/email-sender.ts` defines `EmailTemplate` as a closed union; `platform/outbox/outbox-processor.ts` delivers any `EmailRequested` payload through it, with deduplication by the outbox row.
- `services/api/test/database.integration.test.ts:47` asserts the total table count in its test name (twenty-eight today; `privacy-export-and-erasure` adds one).
- 28 tables, 50 documented paths, `trust/` is the capability home for consent, audit, privacy and now safety.

## Goals

1. A user can report harm from inside the thread where it happened, and cannot report what they cannot see.
2. The owner can read and resolve reports, and suspend an account, with one audited action each.
3. A suspension cannot be outrun by a sign-in in flight.

## Non-goals

Warn/remove states, automatic reinstatement, appeals, case assignment or SLAs, break-glass reads, content moderation, report controls outside the thread.

## Decisions

### D1: One flat `reports` table, one reviewer

`reports(id, reporter_user_id, target_kind, target_id, reason, details, status, decision, resolution_reason, resolved_by_user_id, resolved_at, created_at)` with `target_kind` and `status` as enums, `target_id` as `text` (a `users` id is `text`, the other three are `uuid`, and one column cannot be both), and a check bounding `details`. Authority on the target is verified in the service per kind, because the four targets live in four tables.

- Rejected: four tables, or a polymorphic `target_type`/`target_id` pair with four foreign keys. Four tables means four queue pages; four nullable foreign keys mean four partial indexes and a check that exactly one is set.
- Rejected: a `cases` object (DEBT-28). Assignment, due dates and appeal history are not in this release, and the flat row already answers "what did we do and why".

### D2: Suspend only, with `suspended_until` stored and not enforced

Owner decision D3 removes warn and remove. `users.suspended_until timestamptz NULL` is added `input: false` and written by the suspension action only. Nothing lifts it automatically; lifting is another admin action, which this change does not build because `suspendAccount` has no inverse today and adding one doubles the surface of the first admin write.

- Rejected: a sweeper that reinstates on the date. It turns a judgement into a timer, and the pilot has one reviewer who can lift a sanction by hand.
- Rejected: carrying the end date only in the audit metadata. The admin queue needs to show it, and a JSON metadata field is not a column an operator can sort or see.
- Consequence to state in the docs: the column is stored, displayed, and notified, and the automatic lift is a debt row. The admin label reads "suspension ends" and the notice email states the date without promising automatic reinstatement.

### D3: `DEBT-09` is closed by a post-session status re-check, not by the suspension transaction

The debt's text — "Status read and session insert are not one transaction" — describes the sign-in path, not `suspendAccount`, which is already transactional. The real window is: the library hook reads `ACTIVE`, the suspension commits, the library inserts the session, the response carries a live token for a suspended account. The fix is three lines after `requireAccount` at `:432`: if `account.status !== "ACTIVE"`, call the existing `revokeIssuedSession(sessionToken, requestId)` and throw the same refusal the hook would have thrown. The predicate is one pure function so every non-active status is covered by one table-driven unit test.

- Rejected: wrapping the library call and the session read in one database transaction. The library owns its own connection and its own insert; the seam is not there.
- Honest limitation, recorded in the design and the debt row: the interleaving itself is not deterministically reproducible against the library, so the test suite proves the predicate exhaustively and keeps the existing "suspension revokes every session" integration test; it does not stage a true race.

### D4: Admin notices reuse the outbox with two new templates

`account-suspended` (to the suspended user: reason, end date if any, no identity of any reporter) and `report-resolved` (to the reporter: resolved, decision, no sanction detail). Both are written in the same transaction as their action through `EmailRequested`, so a failed send retries and a retried action cannot double-send because it cannot re-run (the resolution is once and the suspension is a status change).

- Rejected: sending inline like the identity library's verification mail. That path logs and drops on failure, which is the reason the outbox exists.
- Rejected: one combined template. The two recipients must not receive each other's facts.

## Assumptions

- `requireRole` and `ProblemDetailsFilter` behave as they do for the review queue (`403 ROLE_REQUIRED`, `403 MFA_REQUIRED`). Re-check at apply.
- `mentorship/[id]/page.tsx` knows whether the viewer participates (it must, to render the thread), so the Report control can be rendered only for participants without a new read.
- The library's `users` model accepts an extra column with `input: false` exactly as `status` and `anonymizedAt` do; both were added the same way.

## Risks

- **The first admin write route** must register in four places (OpenAPI path, MATRIX row, `ROUTE_BODY_KEYS`, module/request-id middleware). Missing one fails an existing test loudly; the tasks list them separately so a partial apply is visible.
- A suspension is irreversible in this change (no lift route). If an admin suspends the wrong account during the pilot, the remedy is SQL. That is a deliberate narrowing (D2) and is stated in `docs/known-debt.md`; if the owner wants a lift route, it is a small addition to this same change rather than a new one.
- `target_id` as `text` gives up database-level referential integrity on reports. Accepted: the service verifies visibility per kind, and a dangling report is inert rather than dangerous.

## Test order (written into tasks.md)

1. admin refusal without the role, and without a second factor
2. report creation, malformed target, signed-out
3. report refused on a message the reporter cannot see; accepted in their own thread
4. resolution once, second resolution `409`, reporter email, no reporter identity
5. suspension: sessions gone atomically, reason required, end date stored and notified, one audit row
6. the post-session status predicate, every non-active status
7. contract parity, matrix inventory, database probe and table count
