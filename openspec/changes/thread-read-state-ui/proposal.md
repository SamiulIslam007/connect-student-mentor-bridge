# Proposal: thread-read-state-ui

## Why

The server half of `FR-THR-02` is built and invisible. `thread_read_states` (migration `0020`), `POST /v1/mentorships/{id}/read` (`packages/contracts/openapi.yaml:2032`) and `unread_count` on both mentorship reads (`services/api/src/mentorships/mentorship.service.ts:182,191`) all exist, and no page uses them: `DEBT-61` records that no page sends the mark-read write and no page shows the count. So the requirement stays `PARTIAL` for want of a badge, and a participant has no way to learn that a reply is waiting — which is the behaviour the product promises in place of real-time updates (`README.md` §13, "an open thread shows a new message within about 30 seconds by refetch").

The BFF is the missing link: `apps/web/app/api/mentorships/[[...path]]/route.ts:12-21` allows nine patterns and `POST /:id/read` is not one of them, so the browser cannot call the route at all.

## What Changes

- One line of routing: `POST /:id/read` joins the mentorship BFF allow-list.
- The mentorship page sends that write once on open (and on regaining focus after 30 seconds, matching the documented refetch window) and re-reads the thread afterwards, so the marker and the rendered count agree.
- `/requests` shows each mentorship's `unread_count` as a count badge; `/mentorship/{id}` shows a "new messages" marker at the point the previous marker fell, and clears it when the page marks the thread read.
- One pure helper (`apps/web/lib/read-state.ts`) decides what to render from `unread_count` and the marker instant, so the behaviour is testable without a browser.
- No API, contract, schema or migration change: every route and field already exists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mentorship/thread-and-sessions`: **MODIFIED** "Each participant has a read marker in the thread". The requirement's server clauses stay word for word; it gains the browser obligations — that the page writes the marker on open, that the list and the thread show the count, and that a page read never advances the marker on its own (the marker moves only through the write). The scenarios for the server behaviour are restated unchanged, with four new browser scenarios.

## Impact

- **Code**: `apps/web/app/api/mentorships/[[...path]]/route.ts` (one allow-list entry), `apps/web/app/mentorship/[id]/page.tsx` (the write on open, the marker, the clear), `apps/web/app/requests/page.tsx` (the count badge), `apps/web/lib/read-state.ts` (new, pure), `apps/web/lib/strings.ts` (two labels).
- **Contract**: none. The route and the field are already documented and enforced; the `openapi.test.ts` parity test is unaffected because no API path is added.
- **Data**: none. No migration; no table, column or grant changes.
- **Tests**: `apps/web/test/read-state.test.ts` (new, pure), `apps/web/test/requests-page.test.ts` additions (the badge), `apps/web/test/mentorship-page.test.ts` additions (the write on open, the marker), and a BFF wiring test that the allow-list entry exists — the same `readFileSync` style the other BFF routes use.
- **Docs**: `docs/functional-requirements.md` `FR-THR-02`, `docs/known-debt.md` (`DEBT-61` closed), `docs/api-contracts.md` (the browser's use of the route), `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-246, D-247).

## Depends on

- `docs-truth-gate-doc-and-debt-targets` (soft): that change re-points `DEBT-61`'s neighbours and reconciles the gate document; this change closes the row itself.
- `visual-design-and-responsive-layout` (sequence only): the badge is styled by the shared classes, so landing this after the stylesheet avoids styling the badge twice. It is not a functional dependency — the count renders with or without CSS.

## Out of scope

- **A navigation-wide unread badge or a poller.** It needs a fetch on every page and a global state; the two surfaces that already read mentorships are enough for the pilot.
- **Per-message read receipts, "seen by", or last-seen timestamps.** `FR-THR-02` asks for a per-user read state, not a social signal, and a receipt is a new privacy surface.
- **Marking read by scrolling or by time on page.** The write is an explicit event from the page on open; a scroll heuristic marks messages read that nobody saw.
- **A notification email change.** `FR-THR-02`'s email half already ships one message per post (`D-62`) and is untouched.
- **Marking read from the admin or institution surfaces.** A moderator's break-glass read must not move a participant's marker (`D-122`), and nothing in this change touches that path.
- **A server-side "unread since" instant on the mentorship payload.** The marker instant is already returned; a second field would duplicate it.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The mark-read write fires on every render and hammers the API | It is sent once per mount and once per focus refetch, guarded by a ref that records the last sent instant; the write is idempotent server-side (monotonic max), so a duplicate costs one no-op update |
| A participant's own message clears the badge for the other party | The server already counts only the other participant's newer messages; the badge renders `unread_count` verbatim and never derives it |
| The 30-second refetch shows a stale count | The refetch re-reads the mentorship, so the count and the marker come from the same response |
| A slow write makes the UI flicker between marked and unread | The page renders from the response, not optimistically; the badge is removed when the response reports `0` |
| Break-glass reads start moving markers | Not touched, and `services/api/test/mentorship.integration.test.ts` already asserts it; the apply re-runs that suite |

**Rollback**: remove the allow-list entry and the page calls; the server state and every table are unchanged, and the count simply stops being displayed again.

**Traces to** `FR-THR-02`, `DEBT-61`, `D-62`, `D-122`, `D-172` to `D-177`, D-246, D-247.
