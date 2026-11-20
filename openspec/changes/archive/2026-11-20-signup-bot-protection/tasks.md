# Tasks: signup-bot-protection

Decision rows to add at apply (reserved, one contiguous block): **D-221 to D-224** — D-221 the documented honeypot key, D-222 the unsigned httpOnly intent cookie, D-223 the two-second floor and one-hour ceiling in config, D-224 one generic refusal with the check logged server-side. Continue the block for any further `R` decision.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `sed -n '8,20p' packages/contracts/src/body-keys.ts`, `sed -n '70,92p' services/api/src/identity/auth.controller.ts`, `sed -n '1,12p' services/api/src/identity/api-error.ts`.
- [x] 0.2 Read `apps/web/lib/bff.ts` and record whether `proxyJson` takes an explicit body, and how a route returns `NextResponse` while clearing a cookie.
- [x] 0.3 Confirm the register route is CSRF-exempt today and that adding a GET route does not touch the guard: `grep -n "register" apps/web/lib/csrf.ts apps/web/test/csrf-wiring.test.ts`.
- [x] 0.4 Confirm the mechanism is absent: `grep -rni "captcha\|turnstile\|hcaptcha\|honeypot\|signup_intent" services/api apps/web packages`.

## 1. The pure rule

- [x] 1.1 `apps/web/lib/sign-up-intent.ts`: `intentRefusal({ cookieValue, now, minSeconds, maxAgeSeconds })` returning `"missing" | "too-fast" | "stale" | null`, and `honeypotFilled(body)` returning a boolean for a non-empty trimmed string. No React, no `next` import beyond types.
- [x] 1.2 `apps/web/test/sign-up-intent.test.ts`: missing, unparseable, exactly two seconds, one second under, exactly one hour, one second over, and an empty and a whitespace-only honeypot.
- [x] 1.3 Mutation checks recorded here: change the floor comparison to strictly-greater and confirm the boundary test fails; treat a whitespace-only honeypot as filled and confirm that test fails. Restore both.

## 2. The BFF and the marker

- [x] 2.1 `apps/web/app/api/auth/register-intent/route.ts` (new): a `GET` that sets `connect_signup_intent` to the current ISO instant with `httpOnly`, `sameSite: "lax"`, `path: "/"`, `maxAge` from config, and answers `204`.
- [x] 2.2 `apps/web/app/api/auth/register/route.ts`: read cookies and the body once, apply the two checks through the pure helper, refuse with the generic `422 REGISTRATION_REFUSED`, otherwise proxy the parsed body and clear the marker on success.
- [x] 2.3 `apps/web/app/sign-up/page.tsx`: call the intent route once on mount, add the hidden `contact_website` input (`tabIndex={-1}`, `aria-hidden="true"`, `autoComplete="off"`, visually hidden but not `display:none`), include it in the posted body, and render the refusal through the catalog string.
- [x] 2.4 `apps/web/lib/strings.ts`: one refusal string and one honeypot field label (empty), with the reason it is not user-facing.
- [x] 2.5 `packages/config/src/index.ts`: `SIGNUP_MIN_SUBMIT_SECONDS = 2`, `SIGNUP_INTENT_MAX_AGE_SECONDS = 3600`.

## 3. The API's own check

- [x] 3.1 `services/api/src/identity/auth.controller.ts`: before the consent gate, refuse a non-empty `contact_website` with the same code; the body is never forwarded to `identity.register`.
- [x] 3.2 `services/api/src/identity/api-error.ts`: add `REGISTRATION_REFUSED` to the 422 set, and the message text matching the web copy exactly.
- [x] 3.3 Confirm nothing is written on the refusal: no `users`, `consent_records`, `audit_logs` or `signup_blocks` row.

## 4. Contract

- [x] 4.1 `packages/contracts/openapi.yaml`: `contact_website` as an optional string property on the register request schema with a one-line description that it must be empty, and the `422 REGISTRATION_REFUSED` response.
- [x] 4.2 `packages/contracts/src/body-keys.ts`: `contact_website` in the `POST /v1/auth/register` entry.
- [x] 4.3 `pnpm --filter @connect/contracts test` — parity and the inventory test must pass with the new key.

## 5. Tests

- [x] 5.1 `services/api/test/auth-routes.test.ts`: the honeypot refusal answers `422 REGISTRATION_REFUSED` with the generic body and writes no row; the same request with an empty `contact_website` registers as before.
- [x] 5.2 `apps/web/test/sign-up-errors.test.ts` (or a sibling): the three refusals share one string, the page carries the hidden field's four attributes, and the refusal is not hard-coded.
- [x] 5.3 A `readFileSync` wiring test in the existing style: the register route calls the pure helper and the sign-up page calls the intent route.
- [x] 5.4 Mutation checks recorded here: remove the API honeypot check and confirm 5.1 fails; return a different message per check and confirm 5.2 fails. Restore both.

## 6. Docs

- [x] 6.1 `docs/security-requirements.md`: the `SEC-ABUSE-1` annotation names both clauses, the two mechanisms, the refusal code and the log line.
- [x] 6.2 `docs/auth-and-access-control.md`: one line in the pre-session section that registration refuses an automated submission before any row is written.
- [x] 6.3 `docs/api-contracts.md`: the register request's ignored field and the `422` code.
- [x] 6.4 `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-221 to D-224). If an earlier change of this round already rewrote one of these lines, verify it and fix only what is still stale.
- [x] 6.5 `docs/known-debt.md`: if the audit's finding that `SEC-ABUSE-1`'s bot clause was unrecorded has not been closed by an earlier change, record it and close it here.

## 7. Checks, review, handoff

- [x] 7.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — separate commands, exit codes recorded.
- [x] 7.2 `openspec validate signup-bot-protection --strict` and `openspec validate --all --strict`; quote the totals.
- [x] 7.3 Review gate per `AGENTS.local.md` §2, with the silent-failure pass on the two `catch` blocks around cookie parsing and body parsing.
- [x] 7.4 A browser pass on the rebuilt web image: one valid sign-up, then the three refusals by hand (honeypot filled in devtools, immediate submit, a hand-deleted cookie), recording the status and the visible message.
- [x] 7.5 Handoff in chat: the acceptance criteria with evidence, the browser pass result, and the two strings added to the catalog.

## Verification record (2026-11-20)

- Gates: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` 0 — domain 161, web 259, contracts 23, api 378, 0 skipped.
- Focused: `apps/web` → `sign-up-intent` 7, `sign-up-errors` 4, `sign-up-bot-protection` 4, `auth-routes` 18, all pass; `services/api` → `registration-refusal` 2 pass.
- Mutation 1 (skip the API honeypot check): the refusal test answered `200` instead of `422`, restored.
- Mutation 2 (a different detail per check): the byte-identical-refusal test failed, restored.
- Deviation recorded: `REGISTRATION_REFUSED` is mapped in `ProblemDetailsFilter` and in `IdentityErrorCode`; it was **not** added to `VALIDATION_CODES` in `identity/api-error.ts`, because that set translates a *library* input error into a field validation failure, and this refusal is the project's own and must keep its code.
- Deviation recorded: the register route reads the marker from the `Cookie` header through the pure `intentCookieFrom` helper rather than `request.cookies`, so the route stays testable with a plain `Request` and the BFF keeps no Next-only coupling.
- The browser pass on a rebuilt web image is recorded in the round report (`docs/audit/`), not here.
