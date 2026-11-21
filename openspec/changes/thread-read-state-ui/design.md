# Design: thread-read-state-ui

## Context

See `proposal.md` — Why. Verified facts that shape the approach:

- `apps/web/app/api/mentorships/[[...path]]/route.ts:12-21` — the `ALLOWED` set holds `GET /`, `GET /:id`, `GET /:id/messages`, `POST /:id/messages`, `POST /:id/sessions`, `POST /:id/complete`, `PUT /:id/agreement`, `POST /:id/agreement/acknowledge`. A path outside it is a local `404` and never reaches the API.
- `packages/contracts/openapi.yaml:2032` documents `POST /v1/mentorships/{id}/read`; the API route exists and returns the marker and `unread_count`.
- `services/api/src/mentorships/mentorship.service.ts:182` adds `unread_count` to the list projection and `:191` to the single read. The web can read it through the existing `GET` BFF paths with no change.
- `apps/web/app/requests/page.tsx` is 200 lines and already renders one row per mentorship; `apps/web/app/mentorship/[id]/page.tsx` is 538 lines and already owns the thread, the agreement and the sessions.
- `apps/web/lib/page-state.ts` gives the requests surface a `loading`, `empty` and `error` line; the badge must not bypass that vocabulary.
- `D-122` and the spec's break-glass scenario: a moderator's read never moves a marker. Nothing in this change touches that path.

## Goals / Non-Goals

**Goals**

- A participant can see, before opening anything, which mentorship has a reply waiting.
- Opening a thread is what marks it read, and the marker in the thread tells them where they stopped.
- One pure function decides what the UI shows, so the behaviour is testable without a browser.

**Non-Goals**

- No global badge, no poller, no websocket (none exists by decision).
- No per-message state and no "seen by" signal.
- No server change of any kind.

## Decisions

### D-246: The page marks the thread read on open, once per load

- Date: 2026-11-21
- Decision: on mount, the mentorship page sends `POST /api/mentorships/{id}/read` once, then renders whatever the response reports. A second send happens only when the page regains focus after 30 seconds, matching the refetch cadence `README.md` §13 documents. A ref guards against a duplicate mount-time send.
- Reason: a page-level "mark read" button is a control users do not press, and the marker is already monotonic on the server, so an extra write is a no-op rather than a corruption. The write is still the participant's own explicit action in the sense the requirement means: it is produced by them opening their thread, never by a list read or a moderator.
- What would change this decision: a participant asking to keep messages unread after a glance, in which case a per-row "mark unread" is added without changing the open behaviour.
- Alternatives rejected: (a) a "mark all read" button — worse default, same state; (b) marking read on scroll — it marks unseen messages read; (c) marking read from the API's `GET` — the spec's own "A read does not mark anything read" scenario forbids it.
- Status: Decided (owner-approved as the audit's R1 recommendation)
- Affects: `apps/web/app/mentorship/[id]/page.tsx`, `apps/web/lib/read-state.ts`

### D-247: The count shows on the mentorship list and in the thread header, and nowhere else

- Date: 2026-11-21
- Decision: `unread_count` renders as a count badge on each `/requests` row; the thread shows a "new messages" marker at the previous marker's position. No navigation badge, no page-updated browser title, no email-side change.
- Reason: both surfaces already fetch the field, so the change adds no request. A navigation badge needs a global fetch and a poller on every page — the thing the no-WebSocket decision was meant to avoid — and a title badge would claim attention on pages where the user cannot act.
- What would change this decision: pilot feedback that mentors miss replies because they never open the list; then a single fetch on the list page, still not a global poller.
- Alternatives rejected: (a) nav badge — a request on every page; (b) thread-only — a mentor never learns there is a reply.
- Status: Decided (owner-approved as the audit's R2 recommendation)
- Affects: `apps/web/app/requests/page.tsx`, `apps/web/app/mentorship/[id]/page.tsx`

## The pure helper

`apps/web/lib/read-state.ts`:

- `unreadLabel(count)` → the string-catalog label for a count, or `null` when the count is zero, so the badge's absence is a value and not a conditional scattered through JSX.
- `newSince(messages, markerAt)` → the ids of messages written after the marker by the other participant, which is the divider's position. Messages carry their own timestamps; the helper does not compare clocks across participants beyond that.
- `shouldMarkRead({ openedAt, lastSentAt, focusedAt })` → a boolean, encoding D-246's "once per load, once per focus after 30 seconds".

## Risks / Trade-offs

- Two sources of truth for the count (the list response and the thread response) → both come from the same server field and the list is re-read on navigation; no client-side accumulation exists.
- The focus refetch could be surprising in a background tab → the 30-second guard makes it at most one write per half minute per open tab.
- A message arriving between the thread read and the mark-read write stays unread → correct behaviour, and the next refetch shows it.

## Migration Plan

Not applicable: no schema, no contract, no deployment step. The change is reversible by deleting the allow-list entry and the page calls.

## Open Questions

None.
