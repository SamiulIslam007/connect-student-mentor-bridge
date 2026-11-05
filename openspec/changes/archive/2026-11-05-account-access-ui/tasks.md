# Tasks

## 1. Signed-in shell

- [x] 1.1 Add `apps/web/lib/navigation.ts`: a pure `navLinks(isSignedIn: boolean)` returning the app name plus the ordered destinations for each state (`/sign-in`, `/sign-up` when signed out; `/account`, `/profile`, `/account/sessions`, sign-out when signed in). Verify: `apps/web/test/navigation.test.ts` asserts both link sets exactly, that the signed-out set contains no signed-in destination, and that the failure path (probe error) yields the signed-out set.
- [x] 1.2 Add `apps/web/app/session-nav.tsx` (client component: probe `GET /api/me` once on mount, render the app name only until the answer arrives, then `navLinks(...)`) and mount it in `apps/web/app/layout.tsx` above `{children}`. Add the header copy to `apps/web/lib/strings.ts`. Verify: `pnpm --filter web build` passes and every page still renders with the probe blocked (DevTools offline) showing signed-out links.
- [x] 1.3 Add the `Sign out` action: `POST /api/auth/sign-out` then `window.location.assign("/")`, tolerating a `401` by navigating anyway. Verify: a signed-in browser click ends only the current session (`/api/me` is `401` afterwards) while a second session of the same account still answers `200`; `apps/web/test/navigation.test.ts` covers the pure part of the sign-out decision.

## 2. Account area wiring

- [x] 2.1 Link `/account/sessions` and `/account/security` from `apps/web/app/account/page.tsx`, and add a back link to `/account` on both pages, with copy from the string catalog. Verify: one click from `/account` reaches each page and one click returns; `pnpm --filter web build` passes.
- [x] 2.2 Move the "sign out of all sessions" button from `apps/web/app/sign-in/page.tsx` to `apps/web/app/account/sessions/page.tsx` (with its confirmation state), and delete the now-unreachable signed-in state and its handler from the sign-in page. Verify: `apps/web/test/auth-routes.test.ts` still passes unchanged; the sign-in page renders the form, the Google action, and the reset link only.
- [x] 2.3 Send a successful password sign-in to `/account`: `window.location.assign("/account")` when the response body is `status: "signed_in"`, leaving the `mfa_required` branch untouched. Verify: a live sign-in lands on `/account`; `apps/web/test/auth-routes.test.ts` gains a case asserting the route still returns `{ status: "signed_in" }` (the navigation itself is a client behaviour and is covered by the manual check).

## 3. MFA enrollment UI

- [x] 3.1 Expose the enrollment state: add `mfaEnabled` to `AccountSummary` in `packages/domain/src/identity.ts`, map it from `users.two_factor_enabled` in `better-auth-identity.service.ts`, and return `mfa_enabled` from `services/api/src/me/me.controller.ts`. Update `packages/contracts/openapi.yaml` (the `Me` response) and the `GET /v1/me` row in `docs/api-contracts.md`. Verify: `pnpm --filter api test` passes with a new assertion that a freshly registered account reports `mfa_enabled: false` and an enrolled one reports `true`; `packages/contracts` tests pass; the sign-in response shape is unchanged.
- [x] 3.2 Add `apps/web/lib/enrollment-state.ts`: a pure reducer for the page state machine (`idle` → `pending` → `enrolled`, plus `disabling`, and the error branches), covering "wrong password", "wrong code", "factor still inactive after a failed verify", and "codes shown only in `pending`". Verify: `apps/web/test/security-page.test.ts` covers every transition and asserts that no state other than `pending` carries secret or codes.
- [x] 3.3 Add `apps/web/app/account/security/page.tsx` using that reducer and the existing BFF routes (`mfa/enroll`, `mfa/verify`, `mfa/disable`): password field, secret and clickable `otpauth://` link with a copy fallback, backup codes shown once with a "record these now" warning, code field, enabled state with a disable flow, and loading / signed-out / error states. Add all copy to `apps/web/lib/strings.ts`. Verify: `pnpm --filter web build` passes; a live enrollment activates the factor and the next sign-in asks for the second step; after a reload neither the secret nor the codes are visible.
- [x] 3.4 Manual accessibility and viewport pass on the changed pages: keyboard-only traversal of the header and the account area, visible focus, 360-pixel width with no horizontal scroll, and WCAG 2.1 AA contrast on the new copy. Verify: the pass is recorded in the handoff with what was checked and what was found.

## 4. Docs and debt

- [x] 4.1 Correct the live docs: `docs/known-debt.md` §2 (4a is archived, not scheduled); `docs/auth-and-access-control.md` §5 rows 104–105 (admin idle/absolute timeouts belong to Sprint 7 with the admin surface, matching row 101); `docs/mvp-build-plan.md` §2 and `docs/milestones-and-phases.md` §5.2 (role authorization and profile visibility belong to 4c, per D-47); `AGENTS.local.md` §11 trap 4 (the stack is installed) — local only, never committed.
- [x] 4.2 Add the new debt row to `docs/known-debt.md`: the session cookie is `Secure` outside development, so a plain-`http` LAN address loses the session; target "before any LAN or device testing". Verify: the row follows the register's columns and names an owner and a target.
- [x] 4.3 Record the decision that MFA can be enrolled in the UI, that `GET /v1/me` carries `mfa_enabled`, and that sign-out is separate from sign-out-everywhere in `docs/decision-log.md` as new `D-48` (next free number) and update `docs/auth-and-access-control.md` §4.5. Verify: the row carries date, decision, reason, status, and affected docs.

## 5. Integration, review, and handoff

- [x] 5.1 Rebuild and re-run on a clean stack: `docker compose up -d --build`, then `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`. Verify: all four exit 0, the test count is recorded with its date, and 0 tests are skipped.
- [x] 5.2 Review gate on the diff: `/ponytail-review`, the silent-failure check, and the diff-scope check. Verify: every finding is fixed in scope or recorded in `docs/known-debt.md` with a reason.
- [x] 5.3 Handoff: what was built, the manual checks performed (sign-in redirect, session revoke, enrollment, disable, keyboard, 360 px), the new debt, and the docs corrected. Verify: every claim cites a command or a step performed in this session.

## Workflow follow-up

- Archive only when the owner asks: `/ce-compound`, the memory update, `openspec archive`, and `openspec validate --archived --strict`.
- Git lifecycle from `AGENTS.local.md` §6: push the branch, open the PR, wait for green `checks` / `images` / `security`, merge with `gh pr merge <n> --merge --delete-branch`, and paste the raw `git log --oneline -3` from `main`.
