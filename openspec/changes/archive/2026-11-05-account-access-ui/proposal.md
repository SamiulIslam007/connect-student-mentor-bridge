# Proposal

## Why

`access-google-mfa-and-sessions` (4a, archived 2026-11-04) built the second factor, the session list, and per-session revoke, and every one of them is reachable only through the API. The live stack was verified on 2026-11-05: an account can sign up, verify, sign in, and list or revoke sessions, but no page links to `/account/sessions`, no page can enroll a second factor, and a successful password sign-in leaves the user on `/sign-in` with no way into `/account` except typing the URL. The one UI path that exists for a factor is the sign-in *challenge* page, so a real user can satisfy a challenge but can never create one.

That gap blocks the next two Sprint 2 changes: `roles-and-profile-visibility` (4c) enforces MFA by role, and #5 activates mentors only with MFA (FR-PROF-03). Enforcing a factor nobody can enroll is a lockout. It also leaves four statements in live docs that no longer match the repo (a debt row that says 4a is still scheduled, a self-contradicting session-timeout table, two docs that still credit 4a with role authorization and profile visibility, and a stack trap that says the stack is not installed).

## What Changes

- **MFA enrollment and disable in the web app.** A security page under the account area: confirm the password through `POST /api/auth/mfa/enroll`, show the TOTP secret, the `otpauth://` URI, and the eight backup codes exactly once, verify one code through `POST /api/auth/mfa/verify` to activate the factor, and disable through `POST /api/auth/mfa/disable`. **No new endpoint**; one additive response field, `mfa_enabled` on `GET /v1/me`, so the page can tell an enrolled account from an unenrolled one (design D7).
- **A signed-in app shell.** A header rendered on every page: `Sign in` / `Create account` when signed out; `Account`, `Profile`, `Sessions`, and `Sign out` when signed in. One client component asks `GET /api/me`, so no server-side session read is added.
- **Sign out is separate from sign out of all sessions.** A new `Sign out` action ends only the current session and lands on `/`. The "sign out of all sessions" button moves from `/sign-in` to `/account/sessions`, where the session list already lives.
- **The session list becomes reachable.** `/account` links to `/account/sessions`; the sessions page links back to `/account`.
- **A password sign-in lands on `/account`**, matching what the Google callback already does, so the "you are signed in" state and its sign-out-all button on `/sign-in` are deleted rather than kept.
- **Docs cleanup in the same change.** `docs/known-debt.md` §2 (4a is archived, not scheduled); `docs/auth-and-access-control.md` §5 (the idle/absolute timeout rows are internally contradictory — the admin timeouts go to Sprint 7 with the admin surface, not to 4c); `docs/mvp-build-plan.md` §2 and `docs/milestones-and-phases.md` §5.2 (role authorization and profile visibility belong to 4c, per D-47); `AGENTS.local.md` §11 trap 4 (the stack is installed now). `AGENTS.local.md` is gitignored, so that edit is local and is not part of the commit.
- **One new debt row, not a fix.** The session cookie is `Secure` when `NODE_ENV=production`, which works on `http://localhost` but silently drops the session over a plain-`http` LAN address.

No new endpoint and no migration. One additive response field on `GET /v1/me`, mirrored in the contract of record. No new dependency.

## Capabilities

### New Capabilities

- `identity/mfa-enrollment-ui`: a signed-in user can enroll, verify, and disable a TOTP second factor through the web app, and the secret and backup codes are shown exactly once.
- `identity/account-navigation`: the signed-in shell — which destinations are reachable, what sign-out means, and where the session list and the sign-out-everywhere action live.

### Modified Capabilities

- `identity/email-password-auth`: a successful password sign-in now navigates to the account area instead of leaving a signed-in state on the sign-in page.

## Impact

- **Code:** across the workspace, but small: `apps/web` — `app/layout.tsx`, `app/sign-in/page.tsx`, `app/account/page.tsx`, `app/account/sessions/page.tsx`, a new `app/account/security/page.tsx`, new components under `apps/web/app/`, `apps/web/lib/strings.ts`, and `apps/web/test/`; `services/api` — `me/me.controller.ts` plus the `mfaEnabled` field on `AccountSummary` in `packages/domain/src/identity.ts` and its mapper in `better-auth-identity.service.ts`; `packages/contracts/openapi.yaml` — the `Me` response gains `mfa_enabled`; `docs/api-contracts.md` — the same field in the `GET /v1/me` row.
- **Data:** none. `users.two_factor_enabled` already exists (migration `0005`).
- **Configuration:** none.
- **Dependencies:** none. No QR-image library and no component-test library is added (design D5, D6).
- **Docs:** the four files listed above, plus one new `docs/known-debt.md` row.

## Out of scope

- Role authorization, the permission matrix, profile visibility, and any role model — `roles-and-profile-visibility` (4c).
- The admin surface and the admin idle/absolute session timeouts — Sprint 7.
- Availability, access mode, affiliation, and onboarding — 4b and #5.
- Any backend endpoint, including a "has MFA" flag on `GET /v1/me` (design D7 explains why the page works without it).
- Restyling the existing pages beyond what the header and the new entry points require.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The header asks `GET /api/me` on every page, adding a request and a flash of signed-out links | One request per navigation, no polling, and the signed-out rendering is the safe default; the component renders nothing until the first answer arrives (design D2). |
| Moving "sign out of all sessions" off `/sign-in` removes a control a user might look for there | It moves to `/account/sessions`, which is one click from `/account`, and the header's `Sign out` covers the common case. |
| Showing a TOTP secret in the DOM risks it reaching a screenshot, a log, or analytics | The secret exists only in component state after a password-confirmed call, is never written to storage, never logged, and is discarded when the page is left (design D6). |
| The enrollment page re-enrolls while an earlier enrollment is unverified, invalidating the first secret | Stated as expected behavior in the spec and shown as a warning on the page (design D4). |

Rollback: revert the branch. Nothing persists outside the browser, so a revert restores the current behavior with no data to undo.

**Traces to** FR-AUTH-04 (MFA enrollment), FR-AUTH-05 (view sessions, sign out everywhere), FR-UX-01 (mobile-first), FR-UX-03 (string catalog), FR-UX-04 (WCAG 2.1 AA), FR-UX-05 (loading/error/empty states), SEC-AUTH-2 (MFA for privileged roles — the enrollment half), SEC-AUTH-5 (session revocation), D-45 (the challenge is relayed, not re-implemented), D-47 (4c owns role authorization); the live gaps recorded during the 2026-11-05 exploration.
