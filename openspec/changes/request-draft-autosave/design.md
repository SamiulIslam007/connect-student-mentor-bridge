# Design: request-draft-autosave

## Context

See `proposal.md` for motivation.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `a7aba38`, clean; no active change; `openspec validate --all --strict` reports 37 passed, 0 failed once all three of this round's change directories exist (34 specs plus three changes). CI run `42804468000` on `main` is green. No gate was run in this propose round.
- `apps/web/app/request/new/page.tsx` holds six state values: `question`, `contextSummary`, `targetOutcome`, `timeframe` (default `WITHIN_1_MONTH`), `interaction` (default `ASYNC_THREAD`) and `applicationNote`. It reads the mentor id from `?mentor=` in an effect, fetches `/api/mentors/{id}` for the context, and posts to `/api/requests` with a body built in the submit handler.
- `apps/web` has no `localStorage` use today: `grep -rn "localStorage" apps/web` finds one comment in `apps/web/lib/mfa-cookie.ts` stating that the MFA challenge is never written there. No test asserts that browser storage is empty.
- `openspec/specs/identity/email-password-auth/spec.md` requires that `localStorage` and `sessionStorage` hold no access or refresh token. It does not require the store to be otherwise empty.
- The sign-out calls are client-side: `apps/web/app/session-nav.tsx:49` posts to `/api/auth/sign-out` and then navigates home, and `apps/web/app/account/sessions/page.tsx:45` posts to `/api/auth/sign-out-everywhere`.
- Web tests are `node:test` files under `apps/web/test/` invoked as `node --import tsx --test test/*.test.ts`; they never render, and the existing page tests read a source file and assert its wiring.
- `openspec/specs/mentorship/request-lifecycle/spec.md` has eight requirements and mentions no draft, autosave, retry or idempotency, so the new requirement is additive.

## Goals / Non-Goals

**Goals**

- Never lose typed form text to a reload, a back navigation, or a lost connection.
- Keep the logic testable without a renderer, and keep the page's diff to one effect, one write-on-change, and one clear-on-success.
- Leave the request route, its idempotency, and its validation untouched.

**Non-Goals**

- No server-side draft, no cross-device resume, no offline queue.
- No change to any API route, contract, schema or registry.
- No draft for any other form (the message composer keeps its current in-memory behaviour).

## Decisions

Owner decisions keep the numbers the brief fixed (D14 to D16). Decisions taken while writing this proposal carry `R` numbers.

### D14. The store is `localStorage` (owner decision, decision-log D-104)

A single key per mentor profile. Alternatives rejected: `sessionStorage`, which dies on a tab close and therefore misses the most common loss; IndexedDB, which is asynchronous, larger than the problem, and needs an adapter nobody asked for.

### D15. Drafts expire after twenty-four hours (owner decision, decision-log D-105)

A stored draft carries a write timestamp; a read older than twenty-four hours is ignored and the entry removed. Alternative rejected: no expiry, which resurfaces a half-written request weeks later and hides that the mentor's context may have changed.

### D16. Every draft is cleared on sign-out, at both sign-out call sites (owner decision, decision-log D-106)

`clearAllDrafts()` is called in `session-nav.tsx` after a successful sign-out, and in `account/sessions/page.tsx` after a successful sign-out-everywhere. Alternative rejected: relying on the twenty-four hour expiry, which leaves personal text on a shared device overnight. Recording it as "the existing sign-out path" would have missed the second call site, so both are named here.

### R1. The helper owns every rule and the page owns none

`apps/web/lib/request-draft.ts` exports `readDraft(mentorId, storage)`, `writeDraft(mentorId, values, storage)`, `clearDraft(mentorId, storage)`, `clearAllDrafts(storage)`, the `DRAFT_KEY_PREFIX`, `DRAFT_TTL_MS` and `parseDraft(raw)`. The storage object is a parameter with a `globalThis.localStorage` default, so the test passes a fake. Alternative rejected: a React hook, which this repo's web tests cannot exercise without a renderer.

### R2. A malformed or unreadable entry is deleted, not repaired

`parseDraft` validates the shape and returns null on any mismatch; the reader then removes the key. Alternative rejected: coercing fields to defaults, which would silently reopen a form with a half-restored draft that looks complete.

### R3. Writes are debounced, and the timeout is cleared on unmount

The page writes on a 400-millisecond timer per change and flushes on unmount, so typing does not write on every keystroke. Alternative rejected: writing in a `useEffect` on every state change, which is the same frequency with more renders; and writing only on blur, which loses text when the tab closes mid-field.

### R4. Storage failure is silent to the user but not to the log

A failed read or write returns a no-op result and logs one structured event (`web.request_draft_failed`), matching the existing JSON log lines in the page. The user sees nothing, because a failed draft is not an error they can act on. Alternative rejected: a visible warning banner, which would alarm a user whose send still works.

## Acceptance criteria

Five criteria, restated from the exploration report:

1. The six typed field values survive a reload for the same mentor, and a draft written for one mentor is never restored for another.
2. A draft older than twenty-four hours is ignored and removed on the next read.
3. Both sign-out paths remove every draft from browser storage.
4. A successful send clears the draft, a failed send keeps it, and a malformed stored entry is removed without breaking the form.
5. An absent, throwing or quota-exceeded store never blocks sending a request and never shows the user a storage error.

## Assumptions

1. A draft is small: the field limits total about four thousand characters, far below any browser quota.
2. The student uses one device for one request; a draft is not synchronised and that is acceptable.
3. `localStorage` is available in every pilot browser; the helper tolerates its absence regardless.

## Risks / Trade-offs

- Product text sitting in browser storage is a small privacy surface. Mitigation: only the six field values are stored, the entry is cleared on send and on both sign-out paths, and the twenty-four hour expiry bounds the rest.
- A restored draft can hide a now-changed mentor context. Mitigation: the mentor is still fetched on load, and its name is displayed above the form, so a stale draft is visible next to the current mentor.
- The debounce can drop the last keystrokes if the tab is killed within 400 milliseconds. Mitigation: the unmount flush covers navigation; a hard tab kill is accepted, and the loss is bounded to one debounce window.

## Open Questions

- Whether the restored draft should show a one-line notice. Default in this design: yes, one string-catalog line, because silently restoring text is confusing.

## Migration Plan

None. A client-only change. Deploy order is ordinary; a browser that has an old draft key is unaffected because the key is new. Rollback is the revert of the commit; the key prefix can be cleared in a browser if a stale draft is undesirable.
