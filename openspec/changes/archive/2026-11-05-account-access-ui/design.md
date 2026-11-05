# Design

## Context

See `proposal.md` — Why. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified live 2026-11-05, re-check at apply):**

- `main` at `2716a44`; `pnpm lint`, `pnpm typecheck`, `pnpm build` green and `CI=true pnpm test` at **172 passing, 0 skipped** (api 88, web 39, domain 36, contracts 9).
- Docker Compose stack healthy: web `:3000`, api `:3001`, postgres `:55432`, mailpit `:8025`.
- BFF route handlers already exist for every call this change needs: `app/api/auth/mfa/enroll`, `mfa/verify`, `mfa/disable`, `sign-out`, `sign-out-everywhere`, `me`, `me/sessions`, `me/sessions/[id]`. None of them changes.
- `app/account/sessions/page.tsx` renders the session list with a per-session `Revoke` and a "This device" marker, and **no page links to it**.
- `app/layout.tsx` is 18 lines: `<html><body>{children}</body></html>` with no header.
- `app/sign-in/page.tsx` sets `"You are signed in."` and renders a "Sign out of all sessions" button; it never navigates. `app/callback/google/route.ts` redirects to `/account`.
- `app/sign-in/mfa/page.tsx` is the challenge page; the enrollment, verify, and disable routes have no UI caller.
- `apps/web/lib/strings.ts` is the single string catalog (139 lines). `apps/web/test/*.test.ts` use `node:test` + `node:assert/strict` with a stubbed global `fetch`; there is no DOM or component-test library and no `jsdom` dependency.
- `users.two_factor_enabled` exists (migration `0005`), but `AccountSummary` in `packages/domain/src/identity.ts` carries no MFA flag, so `GET /v1/me` cannot report one today.

## Goals / Non-Goals

**Goals**

- Every capability the archived 4a change built is reachable by clicking, not by typing a URL.
- A signed-in user can enroll a TOTP factor without a terminal.
- Sign out (current session) and sign out everywhere are visibly different actions in the right places.
- The four stale doc statements are corrected in the same branch.

**Non-Goals**

- Any role, permission, or visibility behaviour — 4c.
- Availability and access mode — 4b.
- Restyling pages that this change does not have to touch.
- A component-test harness, a QR-image library, or a design-system component library.
- The admin surface and the admin session timeouts (Sprint 7).

## Decisions

### D1 — The header is one client component that probes `GET /api/me`

`app/layout.tsx` stays a server component and renders `<SessionNav />` above `{children}`. `SessionNav` is a client component that calls `GET /api/me` once on mount and derives its link set from a pure function `navLinks(isSignedIn)` in `apps/web/lib/navigation.ts`, which the tests can cover without a DOM. Deriving the links in `lib/` keeps the tested part free of React and keeps the component a rendering shell.

Rejected: reading the session cookie in the server layout — the layout would have to call the API on every render anyway, and a cookie-presence check would treat a dead or revoked session as signed in.

Rejected: passing the account from each page — nine pages would each need the probe, and a page that forgot it would silently lose the header.

### D2 — Signed-out is the rendered default until the probe answers

`SessionNav` renders the app name and nothing else while the probe is in flight, then the signed-out links or the signed-in links. Sign-out is a hard navigation (`window.location.assign("/")`) so the header probes again; an in-app route change would leave the layout mounted with the stale signed-in link set.

Rejected: optimistic signed-in rendering — it briefly offers `Sign out` to a visitor with no session, and a screen reader announces a control that does nothing.

### D3 — Sign out reuses the existing BFF route

`POST /api/auth/sign-out` already forwards the session and deletes the cookie, including the `401` case (verified in `apps/web/app/api/auth/sign-out/route.ts`). The header therefore only calls it and navigates. No new route, no new cookie logic.

### D4 — The security page is `/account/security`, and "pending enrollment" is page state

Three rendered states: **not enrolled** (password field + "Set up second factor"), **pending** (secret, URI, backup codes, code field), **enrolled** (status line + password field + "Turn off"). Pending exists only in component state, so a reload returns to **not enrolled**; the page then warns that starting again replaces the unverified secret.

Why a separate page: the account page is already a read-only summary with a deactivate flow, and enrollment needs a password field, a one-time secret display, and a code field. Putting that on the account page would make the destructive account action and the security setup share one form.

**Assumption (verify at apply):** calling `POST /v1/auth/mfa/enroll` a second time replaces the pending secret, so a secret shown in an abandoned attempt stops working. If the library instead refuses, the page shows that refusal and offers only the disable path.

### D5 — No QR image; show the secret and a clickable `otpauth://` link

The provisioning URI is rendered as (a) the bare secret in an accessible, selectable element, and (b) the full `otpauth://` URI as a link, which a mobile browser hands to an installed authenticator app, plus a copy button using `navigator.clipboard` with a select-the-text fallback for non-secure contexts.

Rejected: a QR encoder — a new runtime dependency for a nicety. Rejected: hand-rolling a QR encoder — too much unreviewed code for a display detail.

### D6 — Secret material lives in component state only

The secret, the URI, and the backup codes exist in React state after a password-confirmed response and nowhere else: not in `localStorage`, not in a cookie, not in the URL, not in a `console` call, not in the string catalog, and not in any audit or log line (the API already guarantees the last one). They are cleared when the component unmounts or the state machine moves on. `autocomplete="new-password"` and `autocomplete="one-time-code"` are set on the two inputs so the browser does not offer to store them.

### D7 — `GET /v1/me` gains `mfa_enabled`; nothing else does

The page cannot otherwise distinguish an enrolled account from an unenrolled one, and guessing from a challenge response is not possible before a sign-in. The field is derived from `users.two_factor_enabled` (already written by 4a) and exposed in the `/v1/me` response only — the sign-in response keeps its current shape, because `me.controller.ts` already documents that it restates the account fields on purpose instead of reusing `AccountSummary` for sign-in.

Rejected: a new `GET /v1/me/mfa` endpoint — a whole route for one boolean. Rejected: adding the flag to the sign-in response — it would leak into a response shape that a different concern owns.

### D8 — Tests cover the pure parts and the existing route seams

- New: `apps/web/test/navigation.test.ts` — link sets for signed-in and signed-out, no signed-in link when the probe fails, and no secret-shaped string in the catalog.
- New: `apps/web/test/security-page.test.ts` — the enrollment state machine as a pure reducer (`lib/enrollment-state.ts`): idle → password submitted → pending → verified → enrolled, and the disable path, including the error branches the page renders.
- Existing route tests are untouched: no route changes.
- The DOM behaviour (focus order, contrast, one-click reachability) is verified by a manual keyboard pass and a 360-pixel viewport check, because the repo has no component-test harness and adding one is a dependency decision this change does not take.

**Assumption:** "component tests" in this repo means the pure-state and route-level tests above; adding `jsdom` + a DOM testing library would be a new dependency and is deliberately not part of this change.

### D9 — The docs cleanup is part of the change, not a follow-up

Exact edits, all one-liners except the table pair:

| File | Change |
|---|---|
| `docs/known-debt.md` §2 | The last bullet says Google/MFA/session list "are scheduled as `access-google-mfa-and-sessions` (4a, Sprint 2)". 4a is archived 2026-11-04; the bullet becomes a "delivered by" statement. |
| `docs/auth-and-access-control.md` §5 | Rows 104–105 say the admin idle/absolute timeouts are "deferred to Sprint 2 with MFA" while row 101 says they belong to 4c. Both rows are corrected to Sprint 7 with the admin surface, per the owner decision recorded in this change. |
| `docs/mvp-build-plan.md` §2 | The Sprint 2 row still credits 4a with "role authorization, profile visibility"; D-47 moved them to 4c. |
| `docs/milestones-and-phases.md` §5.2 (≈ line 108) | Same statement, same correction. |
| `AGENTS.local.md` §11 trap 4 | Says Drizzle, better-auth, pg-boss, Zod, Tailwind, Playwright and friends are "not installed". Corrected to the installed set. This file is gitignored: the edit is local, and the commit cannot contain it. |

A new `docs/known-debt.md` row records the `Secure`-cookie LAN behaviour as debt with no owner assignment beyond "before any LAN or device testing".

## Assumptions

- The existing BFF routes need no change; the exploration on 2026-11-05 exercised enroll, sessions list, and revoke successfully through them.
- `users.two_factor_enabled` reflects an *active* factor (the library sets it after verification), so `mfa_enabled: true` means "challenge at next sign-in".
- The recoverable-secret display is acceptable for a pilot with one operator; a "show codes again" feature would need server-side re-issuance and is out of scope.

## Risks

| Risk | Mitigation |
|---|---|
| The header probe adds a request on every full page load | One request per load, no polling, no `cache: "no-store"` retry loop; the probe failure path renders signed-out links. |
| Hard navigation on sign-out loses in-page state | Sign-out is a terminal action; nothing is left to preserve. |
| A user records neither the secret nor the codes and has no way back in | The page states plainly, before and after enrollment, that the codes are shown once; a lost factor is still recoverable through the existing password sign-in and the disable path. |
| The doc edits drift again at the next archive | The docs task in `tasks.md` is a required checkbox, and `AGENTS.local.md` §4 already makes a docs update a gate. |
