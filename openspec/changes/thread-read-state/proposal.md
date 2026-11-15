# Proposal: thread-read-state

## Why

`FR-THR-02` requires an email notification on a new message **and** per-user read state. The email half ships (one outbox event keyed on the message id, D-62). The read half does not: `thread_messages` carries no read marker anywhere, `grep -rn "thread_read\|read_state\|last_read" services/api/src apps/web/lib` returns nothing, and the register scores the row `PARTIAL` for exactly that reason. A participant therefore cannot tell which messages arrived since they last opened the thread, and every later feature that wants "3 new messages" (a nav badge, a notification list, an inbox) has nothing to read.

## What Changes

- One `thread_read_states` table: one row per (mentorship, participant), holding a monotonic `last_read_at`.
- One explicit write route, `POST /v1/mentorships/{id}/read`, for a participant only. No route marks the thread read as a side effect of a `GET`.
- `unread_count` on the mentorship read and on the mentorship list, derived from the other participant's messages newer than the marker.
- The break-glass read stays read-only with respect to the marker: a moderator reading a thread moves nobody's marker.
- A moderator's own `EVIDENCE`-free access changes nothing here; the existing `THREAD_BREAK_GLASS_READ` audit row remains the record of that access.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mentorship/thread-and-sessions`: one requirement is added for the read marker and the unread count. No existing requirement changes: the thread stays participant-only, messages stay immutable, and the email requirement is untouched.

## Impact

- **Code**: `services/api/src/db/schema/mentorships.ts` (one table), migration `0020` with its hand-written `GRANT` block, `services/api/src/mentorships/mentorship.service.ts` and `drizzle-mentorship.service.ts` (a `markRead` method and `unread_count` on the two reads), `services/api/src/mentorships/mentorships.controller.ts` (one route), `packages/domain/src/` (one pure unread-count rule), `services/api/src/app.module.ts` only if a new provider is needed (expected: no).
- **Contract**: `packages/contracts/openapi.yaml` gains the path and the `unread_count` property; `@connect/contracts` `ROUTE_BODY_KEYS` gains `POST /v1/mentorships/{id}/read` with no keys; `services/api/test/authorization-matrix.test.ts` `MATRIX` gains one participant row.
- **Data**: one new table, no column added to an existing table, no backfill. A mentorship with no marker reads `unread_count` as the count of all of the other party's messages, which is the honest answer for a reader who never opened the thread.
- **Tests**: `services/api/test/mentorship.integration.test.ts` (marker, monotonicity, unread, refusals, break-glass isolation, cascade), `packages/domain/test/` for the pure rule, `apps/web` untouched.
- **Docs**: `docs/data-model.md` (the table and its grants), `docs/api-contracts.md` §5.5 (the route and the two payloads), `docs/functional-requirements.md` (`FR-THR-02` stays `PARTIAL`, with the new gap named as the UI), `docs/known-debt.md` (one row for the unbuilt UI), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line (audit finding C1), `docs/audit/2026-11-15-hermes-explore.md` where it describes this change.

## Depends on

- `mentorship-thread-and-sessions` (#8, archived 2026-11-08): the mentorship, the thread and the participant predicate this change reads.
- `break-glass-thread-read` (archived 2026-11-12): the admin read whose behaviour this change must leave alone.

## Out of scope

- The web app: no BFF route, no badge, no page change. `FR-THR-02` therefore stays `PARTIAL` until a page reads the count, and this proposal says so in the register row.
- Per-message read rows, read receipts shown to the counterpart, "typing", presence, and any push or WebSocket delivery.
- Marking the thread read on `GET` or on posting a message.
- A notification list (`FR-NOT-02`) or a nav badge; both are separate Should requirements.
- Read state for the institution admin or any role other than the two participants.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A read marker written by a non-participant, or by a moderator, corrupts the evidence of what a participant had not seen | The write resolves participation in the service before it writes (`404` otherwise), and the break-glass path never calls `markRead`; two integration tests assert both |
| A concurrent double mark-read moves the timestamp backwards | The update is conditional on `last_read_at < now()` (or the row is absent), so a stale writer cannot regress it |
| Unread counts are expensive on a long thread | The count is one indexed aggregate on `(mentorship_id, created_at)` filtered by `sender_user_id <> caller`; the existing keyset index already covers the scan |
| The API accepts a marker for a mentorship whose status forbids reading | Participation is the only predicate, as it is for the thread read today; a `COMPLETED` thread stays readable by its participants |

Rollback: drop the route and revert the controller; the table can stay (no reader) or be dropped in a follow-up migration. No data is destroyed either way, because the marker is derived convenience data.

## Decisions taken here

The owner fixed the mechanism. One thing was not stated and is decided in `design.md` R4: `unread_count` appears on the mentorship **read and list** rather than on the message page, because the message page is a keyset page and a count on a page is a number about a window, not about the thread. The safest reading of "per-user read state" is the count on the object the participant opens first.
