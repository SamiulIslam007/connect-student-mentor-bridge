# Tasks: csrf-token-on-cookie-writes

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `42768e9` or its merge line), `git status`, `find apps/web/app/api -name route.ts | wc -l` (48), `grep -rn "readSessionCookie" apps/web/app/api | wc -l`, `grep -rn "cookie" services/api/src --include=*.ts`. Record every mismatch before writing code.
- [x] 0.2 Confirm the five exempt routes still have no session when they run: read `apps/web/app/api/auth/sign-in/route.ts`, `/sign-in/provider`, `/register`, `/forgot-password`, `/reset-password`, and record in this file which of them sets the session cookie.
- [x] 0.3 Count the write call sites to size task 3: `grep -rho 'method: "\(POST\|PUT\|DELETE\)"' apps/web/app --include=*.tsx | wc -l` (expect 35 in 22 files).

## 1. The token and the guard

- [x] 1.1 Add `apps/web/lib/csrf.ts`: `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`, `mintCsrfToken()`, `csrfCookieOptions()`, `sameToken(a, b)` (constant time, length-independent), `originAllowed(request)`, `requireCsrf(request): NextResponse | null`, `CSRF_MODE` read from `WEB_CSRF_MODE`. Verify: `pnpm --filter web typecheck`.
- [x] 1.2 Unit tests in `apps/web/test/csrf.test.ts`: two mints differ; `sameToken` refuses an off-by-one value and an empty one; `originAllowed` accepts the configured origin, refuses a foreign one, and passes a request with no `Origin` when the token matches; the refusal body is the documented problem shape with `403` and `CSRF_INVALID`. Verify: `pnpm --filter web test`.
- [x] 1.3 Mutations: force `sameToken` to `true` and confirm 1.2 fails on the mismatch case; force `originAllowed` to `true` and confirm the cross-site case fails. Restore both, record the two results in the handoff.

## 2. Issuing the token

- [x] 2.1 `apps/web/app/api/me/route.ts` sets `connect_csrf` when the cookie is absent and a session cookie is present, leaving an existing value untouched. Verify: a test in `apps/web/test/csrf.test.ts` drives the route's helper with a fake request and asserts `set-cookie` presence and absence.
- [x] 2.2 Add `apps/web/app/api/csrf/route.ts` (`GET`): same mint, `Cache-Control: no-store`, `401` when there is no session. Verify: typecheck plus the wiring test in 3.2 sees the route in the exempt-from-guard-but-guarded-by-session list.
- [x] 2.3 `apps/web/lib/csrf-client.ts`: `csrfFetch(input, init)` reads the cookie, adds the header, and re-mints once through `GET /api/csrf` on a `403 CSRF_INVALID`, retrying the request once. Verify: a unit test with a fake `fetch` asserts one retry and no infinite loop.

## 3. Wiring the guards and the helper

- [x] 3.1 Add `const refused = await requireCsrf(request); if (refused) return refused;` to each write method of the 34 write-capable route handlers, after the session read and before the body parse. Verify: `grep -rln "requireCsrf" apps/web/app/api | wc -l` equals 34.
- [x] 3.2 `apps/web/test/csrf-wiring.test.ts`: reads every `route.ts` under `apps/web/app/api`, fails when a file exports `POST`/`PUT`/`PATCH`/`DELETE` without `requireCsrf` unless it is in the five-name exemption list, and fails when the exemption list grows without this file changing.
- [x] 3.3 Replace the write `fetch(` calls in the 22 client components with `csrfFetch`, one commit per group of pages (auth, profile, requests, mentorship/outcomes, admin, institution). Verify per group: `grep -rn 'method: "\(POST\|PUT\|DELETE\)"' apps/web/app --include=*.tsx` shows no bare `fetch` left beside them.
- [x] 3.4 Extend `csrf-wiring.test.ts`: every `*.tsx` that sends a write calls `csrfFetch`, and no `*.tsx` builds an `authorization` header. Verify: the test fails when one page is reverted to `fetch`.

## 4. Registry checks (expected: no change, asserted rather than assumed)

- [x] 4.1 Assert no API change: `git diff --stat -- services/api packages/contracts` is empty, and `grep -rn "csrf" services/api/src packages/contracts` returns nothing. If any registry needed a row, stop and re-open the design — that would mean the boundary moved.
- [x] 4.2 Confirm `packages/contracts/test/openapi.test.ts` and `services/api/test/authorization-matrix.test.ts` still pass untouched.

## 5. Docs and register

- [x] 5.1 `docs/auth-and-access-control.md`: a new subsection under the browser-credential section stating the two-cookie model, the header, the five exemptions, and that the API is bearer-only.
- [x] 5.2 `docs/api-contracts.md`: one paragraph on the BFF boundary (session cookie in, bearer plus CSRF out) and the `403 CSRF_INVALID` body.
- [x] 5.3 `docs/security-requirements.md`: annotate `SEC-AUTH-4` as built for cookie writes, naming the test; `docs/known-debt.md`: close `DEBT-03` with the evidence sentence.
- [x] 5.4 `docs/local-setup.md`: `WEB_CSRF_MODE` in the variable list (name only, no value).
- [x] 5.5 `docs/decision-log.md`: add the reserved rows (full text at the end of this file), and update `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md`.

## 6. Gates, review and handoff

- [x] 6.1 One background job from the root, each gate's exit code echoed: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`. Per-package totals recorded including skipped. `DATABASE_URL` must point at the local published port (55400 on this machine).
- [x] 6.2 Line-by-line pass on the diff (every write route guarded, no read guarded, no retry loop, no token in a log), then an independent adversarial pass on the diff and the delta spec.
- [x] 6.3 Handoff: the guard, the mint, the 34 wired routes, the 22 pages, both mutations, the gate totals, `DEBT-03` closed, and the reserved decision rows.

## Decision rows to add at apply

Written at apply as **`D-158 … D-161`**. `D-155` was the last recorded row when this file was written; `docs-register-and-local-setup-fixes` then took 156 and 157, so this change starts at 158.

- **D-158**: The CSRF boundary is the Next BFF, not the API, because the API's only session credential is a bearer token it reads from the `authorization` header; no `/v1` route parses a session cookie. Reason: a check on a credential the browser never sends to the API would guard nothing and pollute the OpenAPI document. Affects: `platform/http-security-controls`, `docs/api-contracts.md`, `docs/auth-and-access-control.md`.
- **D-159**: The token is 32 random bytes in a readable `connect_csrf` cookie compared to the `x-csrf-token` header in constant time; the session cookie stays httpOnly. Reason: double-submit needs a value the client helper can read; an HMAC of the session would rotate for no gain. Affects: `apps/web/lib/csrf.ts`, `docs/auth-and-access-control.md`.
- **D-160**: Five writes are exempt (sign-in, provider sign-in, register, forgot-password, reset-password) because no session exists yet; sign-out stays guarded because a forced sign-out is a real attack. Reason: the exemption list must be reasoned per route, not per path prefix. Affects: `apps/web/lib/csrf.ts`, `docs/auth-and-access-control.md`.
- **D-161**: `WEB_CSRF_MODE=off` is a documented one-deploy rollback. Reason: the owner's field-failure answer should be a restart, not a hotfix. Affects: `apps/web/lib/csrf.ts`, `docs/local-setup.md`.

## Apply record (2026-11-14)

### Deviations from the plan, and why

1. **36 write-capable routes, not 34.** `find apps/web/app/api -name route.ts` returns 48 files and 36 of them export a write method. Five are exempt, so **31** carry the guard (`grep -rln "requireCsrf" apps/web/app/api | wc -l` returns 30 files, because `mentorships/[[...path]]` and `sessions/[[...path]]` share one `forward` helper that serves POST/PUT for the whole surface: 30 files, 31 write handlers). Task 3.1's expected `34` was a propose-time miscount and is recorded rather than forced.
2. **35 write call sites in 19 `.tsx` files, not 22.** The design's "22 components" counted pages that also read; the write sites are 35 across 19 files, which is the number task 0.3 asked for. All 35 were converted.
3. **`/api/auth/mfa/verify` is guarded, and the guard passes a request with no session cookie.** That route authenticates either an enrollment (session cookie) or a challenged sign-in (only the opaque `mfa_challenge` cookie). Refusing the second would break the sign-in step, because no token can be minted for a caller who has no session. The guard therefore treats "no session cookie" as "nothing authenticated to protect" and lets the route's own `401` answer (D-160). This is the one behavioural rule the proposal did not state, and it is why the exemption list stays at five.
4. **`requireCsrf` is synchronous** (`NextResponse | null`), not `await`ed as task 3.1 sketched: it reads headers and a cookie and needs no I/O. The call sites read `const refused = requireCsrf(request); if (refused) { return refused; }`.
5. **Existing web tests were updated, which the task list did not mention.** 25 cookie literals across 15 route tests gained the `connect_csrf` cookie and the `x-csrf-token` header (so they exercise the guard instead of bypassing it), and six page-source assertions in `institutions.test.ts`, `report-control.test.ts`, `consents.test.ts` and `account-privacy.test.ts` now name `csrfFetch` for a write. No assertion was weakened: the write assertions moved to the helper, the read assertions stayed on `fetch`.

### Evidence

- Guard and helper: `apps/web/lib/csrf.ts` (`requireCsrf`, `originAllowed`, `sameToken`, `mintCsrfToken`, `csrfCookieOptions`, `ensureCsrfToken`, `CSRF_EXEMPT_ROUTES`, `csrfMode`), `apps/web/lib/csrf-client.ts` (`csrfFetch`), `apps/web/lib/session-cookie.ts` (the cookie reader extracted as `readCookie` and reused).
- Issuing: `apps/web/app/api/me/route.ts` sets the cookie when it is absent; `apps/web/app/api/csrf/route.ts` is the `GET` mint, `401` without a session, `Cache-Control: no-store`.
- Wiring: `grep -rln "requireCsrf" apps/web/app/api | wc -l` = 30 files / 31 write handlers; `grep -rn 'method: "\(POST\|PUT\|DELETE\)"' apps/web/app --include=*.tsx` = 35 sites, all `csrfFetch`, verified by `csrf-wiring.test.ts`.
- Unit tests: `apps/web/test/csrf.test.ts` (17 tests: mint, compare, origin, refusal shape, the route-level refusal with the API never called, the matched pair reaching the API, `WEB_CSRF_MODE=off`, both mint routes, the client helper's one retry and no loop), `apps/web/test/csrf-wiring.test.ts` (6 tests).
- Mutations, all caught and restored: `sameToken` forced to `true` fails "sameToken refuses any difference including length and absence" and "a write with a mismatched token is refused"; `originAllowed` forced to ignore the origin fails "originAllowed compares the configured origin" and "a cross-site origin is refused even with a matched token"; one page reverted to a bare `fetch` fails "every page that writes uses the helper".
- Registry check (task 4.1): `git diff --stat -- services/api packages/contracts` is empty and `grep -rn csrf services/api/src packages/contracts` returns nothing. No API change, no OpenAPI row, no matrix row, no body key.
- Web suite: 219 tests before, 242 after (+23: 17 + 6), 0 fail, 0 skipped.
- Browser verification (the owner's requirement): recorded in the run report and in the change handoff, not in this file.

### Decisions

`D-158` (boundary is the BFF), `D-159` (32-byte double-submit cookie compared in constant time), `D-160` (five exempt writes, sign-out guarded, session-less requests passed through), `D-161` (`WEB_CSRF_MODE=off` rollback).

### Defect found by the browser pass, and fixed

`/api/mentorships` and `/api/outcomes` are catch-all routes whose `forward` helper serves GET and the writes together. The first wiring pass put the guard at the top of that helper, so a **read** was refused with `403 CSRF_INVALID`: the mentorship page answered "This mentorship could not be loaded" for a signed-in participant. The guard is now applied only when `method !== "GET"`, and `csrf.test.ts` gained a test that calls each catch-all's `GET` with a session cookie and no token and asserts the response is not a `CSRF_INVALID` refusal. The web tests did not catch it because no unit test drove the catch-all reads; the browser did, on the first page that uses one.

### Browser verification (real Chrome against the local stack, 2026-11-14)

Run in the desktop browser tool against `http://localhost:3000` with the rebuilt web and API images, three fixture accounts (`csrf.student@example.com`, `csrf.mentor@example.edu.bd`, `csrf.admin@example.com`) created in the dev database because the per-IP register throttle (3 per hour) had already been spent by the session's earlier sign-up attempts. Sign-up through the UI was therefore attempted and rate-limited, not completed; every other flow below is a UI flow.

| Flow | Result |
|---|---|
| Sign-up form submit | `POST /api/auth/register` sent with the helper; `429 RATE_LIMITED` from the throttle, so no account was created that way (fixtures used instead) |
| Sign-in (password) | pass, lands on `/account`, `connect_csrf` minted by `GET /api/me` (43 characters, readable, session cookie still httpOnly) |
| MFA enrollment | pass: password confirmation, setup secret shown, TOTP code accepted, "Second factor is on" |
| Sign-out | pass (guarded write; session cleared, csrf cookie kept) |
| Sign-in with MFA | pass: password to `/sign-in/mfa` to `/account` |
| Create request | pass: form to `POST /api/requests` `422` "save a student profile" until the profile existed, then redirect to `/requests` |
| Accept | pass from the mentor session: "The request was accepted." |
| Decline | pass: reason prompt, "The request was declined." |
| Report outcome | pass: `POST /api/outcomes` `201`, status `pending_confirmation` |
| One admin action | pass: `POST /api/institutions` `201` as a platform admin with an enrolled factor |
| Write with no token | `403 CSRF_INVALID` |
| Write with a wrong token | `403 CSRF_INVALID` |
| Write with the matched token | passes the guard and reaches the API's own rule (`403 ROLE_REQUIRED` for a student on a mentor route) |
| `WEB_CSRF_MODE=off` rollback | a tokenless write reaches the API (`403 ROLE_REQUIRED`, no `CSRF_INVALID`), then enforcing restored and the same write is `403 CSRF_INVALID` again |
| Console, CSP violations, failed requests | zero CSP violations, zero console errors, zero unhandled rejections, no failed request on `/`, `/sign-in`, `/mentors`, `/account`, `/requests`, `/account/security` and `/mentorship/{id}` |

The rollback was applied with a Compose override file outside the repository, so `.env` was not touched. One earlier note for the record: the running web and API images predated 2026-11-09 and `2026-11-12` respectively, so both were rebuilt from this branch before the pass; the stale API image is why `/v1/institutions` first answered `404`.
