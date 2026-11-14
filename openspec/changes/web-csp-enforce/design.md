# Design: web-csp-enforce

## Context

**Repository snapshot (verified 2026-11-14 at propose, re-check at apply).**

- Base: `main` at `42768e9`, clean tree, zero active changes; gates at propose: lint 0, typecheck 0, 674 tests / 0 fail / 0 skipped, build 0.
- `apps/web/lib/security-headers.ts` exports `WEB_SECURITY_HEADERS` (a plain array, deliberately data so a test reads it without Next's loader) and `WEB_SECURITY_HEADERS_SOURCE = "/(.*)"`. Line 11 is the key `Content-Security-Policy-Report-Only`; the value is `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'`.
- `apps/web/next.config.ts` line 4 imports both and applies them as `headers()` for the source pattern.
- The web app has **no stylesheet and no third-party script**: `grep -rn "\.css" apps/web/app apps/web/lib` returns nothing, and no script tag with a foreign source exists. `apps/web/app/layout.tsx` renders `SessionNav` and children only.
- The Google relay is `apps/web/app/callback/google/route.ts` (same-origin navigation) and `apps/web/app/api/auth/sign-in/provider/route.ts` (server-side fetch to the API).
- `apps/web/test/security-headers.test.ts` asserts the header set exists and names the report-only header explicitly (lines 14 and 29).
- `docs/known-debt.md` `DEBT-56` records the report-only state and names "a manual browser pass over the Google callback relay and Next's inline bootstrap" as the precondition.

## Goals / Non-Goals

**Goals**

- The policy enforces in the default configuration, with the same directive list it reports today.
- A one-restart rollback exists and is documented.
- The claim is bounded and stated: inline scripts remain allowed, so this blocks foreign origins and framing, not injected inline script.

**Non-Goals**

- No nonce or hash-based `script-src`, no middleware, no `report-to` endpoint.
- No change to the API's policy, no CORS allowlist.
- No styling work.

## Decisions

The owner fixed the enforcement, the moment (before any stylesheet exists), the flag, the test extension and the manual checklist as the definition of done. Decisions taken here carry `R` numbers.

### R1. The header key changes; the directive list does not

Enforcement with the same list keeps the diff to one key and one flag, so a failure is unambiguous: if a flow breaks, the list was wrong, not the key. Adding `object-src 'none'` or `upgrade-insecure-requests` in the same change would make a break harder to attribute, and both are follow-ups. Alternative rejected: tightening the list now that it is cheap, which mixes a policy decision into a mode change.

### R2. `'unsafe-inline'` stays, and the gain is stated honestly

Next injects an inline bootstrap script, and the app has no nonce plumbing. Removing `'unsafe-inline'` now would either break the app or need a middleware and a rendering change — a different change with its own risk. What enforcement buys today is real: foreign script, style and connect origins are blocked, framing is blocked, and a future injected script tag pointing at another host fails. What it does not buy is protection against inline injection; that is recorded as a debt row rather than claimed.

### R3. The flag is read in `next.config.ts`, so it is a build-or-start-time switch

`WEB_CSP_MODE` is read once when the config loads (build time for a built image, start time for `next dev`). That matches how the header array is already static data and avoids per-request work. The cost — a restart to flip — is exactly what a rollback wants. Alternative rejected: a middleware reading the flag per request, which would put a header decision in the request path for a switch nobody flips twice.

### R4. The test asserts both modes, and names the enforcing header

`security-headers.test.ts` gains the mode matrix: default → enforcing present and report-only absent; `WEB_CSP_MODE=report-only` → the reverse; and the directive list string is asserted once, so a future edit cannot silently drop `frame-ancestors` or `form-action`. The existing assertions that named the report-only header are rewritten, not deleted.

### R5. The change is not done until the browser checklist passes

No agent in this repo can run a browser against the stack, so `tasks.md` ends with the checklist the owner executes: sign-up, sign-in, Google sign-in including the callback, MFA enrollment, one form submit, one admin read, and the console read for each. `DEBT-56` is closed only after that checklist is recorded in the change's `tasks.md` with the date and who ran it.

## Assumptions

1. `BETTER_AUTH_URL` and the API URL are both same-origin from the browser's point of view, so `connect-src 'self'` covers every call the browser makes (the browser never calls the API directly; `apps/web/lib/api.ts` says so in its own comment).
2. No page loads a font, image or script from a third-party host today.
3. The owner has a browser and a Google test account; the Google leg cannot be completed without one.

## Risks

- A break that only appears on a route outside the checklist. Mitigation: the checklist covers one route per page family, and the flag is one restart.
- Overstating the control. Mitigation: R2's bound is repeated in `docs/security-requirements.md`'s annotation, so `SEC-API-3`'s evidence does not read as "CSP with no inline".

## Acceptance criteria

1. Default configuration: `Content-Security-Policy` present on every route, `Content-Security-Policy-Report-Only` absent.
2. `WEB_CSP_MODE=report-only`: the reverse, with no code change.
3. The directive list is byte-identical to the one this change started from, asserted in the test.
4. The checklist passes with no CSP violation in the console on any listed flow.
5. `DEBT-56` is closed only with the checklist's date and runner recorded.
