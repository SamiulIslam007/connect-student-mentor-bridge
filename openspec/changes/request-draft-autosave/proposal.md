# Proposal: request-draft-autosave

## Why

`FR-REQ-02` is Must and only half built: the request route already refuses a retried submission safely through its idempotency key, but nothing keeps the typed text, and `docs/mvp-build-plan.md` row 7 ends with the words "draft autosave remains open". The form asks for a specific question, a context summary, a target outcome and an optional application note — up to four thousand characters — on the pilot's main device, a low-end Android browser on a slow network (assumption A8). A dropped connection or an accidental navigation loses all of it.

## What Changes

- Add a pure draft helper in `apps/web/lib/request-draft.ts`: read, write, expire, clear, and tolerate absent, throwing, or quota-exceeded storage.
- Persist the draft text on `/request/new` under a key that includes the mentor profile id, debounced while typing, restored on load, cleared on a successful send, and kept on a failed send.
- Expire a draft older than 24 hours: it is ignored and removed on the next read.
- Clear every draft on sign-out, in the existing sign-out path, so a shared device does not keep the text.
- Keep the page a thin caller: all logic lives in the helper, because web tests in this repo never render.
- No API change, no schema change, no contract change, no new dependency, and no new route, so no registry entry changes.
- Add the two debt rows this audit found missing: `FR-AUTH-09`'s reversal of self-deactivation, which has no `reactivate` path anywhere in `services/api/src`, and a progress note for `FR-REQ-02`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mentorship/request-lifecycle`: a new requirement is ADDED for the on-device draft. No existing requirement or scenario changes; the spec has nothing about drafts today (a grep for `draft`, `autosave`, `retry` and `idempot` in that spec returns nothing), so this is an additive concern rather than a modification.

## Impact

- **Code**: new `apps/web/lib/request-draft.ts`; edited `apps/web/app/request/new/page.tsx`, `apps/web/lib/strings.ts` (one restored-draft line), and both sign-out call sites (`apps/web/app/session-nav.tsx` and `apps/web/app/account/sessions/page.tsx`), which clear every draft after a successful sign-out.
- **Tests**: new `apps/web/test/request-draft.test.ts` with a fake storage object; edited `apps/web/test/navigation.test.ts` only if the sign-out path is asserted there.
- **API/contract**: none. No route is added or changed, so `packages/contracts/openapi.yaml`, `packages/contracts/src/body-keys.ts`, `services/api/test/authorization-matrix.test.ts` and `services/api/test/request-validation.integration.test.ts` are untouched.
- **Data**: none, and deliberately not on the server: a draft is text the user typed but has not sent, so it stays on the device and never becomes a row.
- **Dependencies**: none added.
- **Docs**: `docs/known-debt.md` (the `FR-REQ-02` progress note plus the `FR-AUTH-09` row), `docs/functional-requirements.md` (`FR-REQ-02` built to depth, `FR-UX-02` partially built), `docs/mvp-build-plan.md` row 7 (drop the "draft autosave remains open" clause), `docs/milestones-and-phases.md` current state, `docs/decision-log.md` (three rows), `README.md` status line if it names the last change.

## Depends on

- `mentorship/request-lifecycle` (archived 2026-11-08): the request form field set, the idempotency key on `POST /v1/requests`, and the field limits the draft keeps.
- `identity/email-password-auth` (archived 2026-11-03): its requirement that browser storage never holds a token. This change stores draft text only, and states that limit in the new requirement so the two specs cannot be read as contradicting each other.

## Out of scope

- Offline queueing, background sync, or a service worker (`FR-UX-01` is its own unbuilt Must).
- Server-side drafts, cross-device drafts, or resuming a draft days later on another device.
- Retrying a failed send automatically; the existing idempotency key already makes a manual retry safe.
- Drafts for the message composer on `/mentorship/{id}` or for any other form.
- Encryption of the stored draft: it is unencrypted browser storage, acceptable for text the user typed, and it is cleared on send and on sign-out.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Personal text survives on a shared device | Every draft is cleared on sign-out (D16), and the 24-hour expiry bounds what a forgotten session leaves behind |
| The restored text fights React's first render | The helper returns the parsed draft, and the page applies it in an effect that runs once; the test asserts the parse is pure so the failure mode is visible without a renderer |
| A quota error breaks the form | Every storage call is wrapped, a failure returns a no-op result, and sending proceeds; the helper test drives a throwing storage and a quota-exceeded storage |
| The draft key collides between mentors | The key includes the mentor profile id, and a test asserts a draft written for one mentor is not read for another |
| Browser storage starts holding something sensitive | The stored value is the four form fields only; no token, no session, no email is written, and the requirement states that |

Rollback: delete the helper and its test, revert the page and the sign-out edit, and clear the key prefix once in a browser if a stale draft is undesirable. Nothing is persisted server-side, so no data repair is possible or needed.

**Traces to** FR-REQ-02 (draft autosave and safe retry), FR-UX-02 (resilient forms with clear error states), FR-UX-05 (designed empty, loading and error states, unchanged here); ADR-016 (Docker-first local development, unaffected), ADR-003 (cookies handled by the BFF, which this change does not touch); D-61 and D-59 (unchanged); DEBT-21 (the missing idempotency store for messages, unrelated and untouched).
