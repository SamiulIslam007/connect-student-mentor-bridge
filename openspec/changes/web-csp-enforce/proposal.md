# Proposal: web-csp-enforce

## Why

`SEC-API-3` names a strict content security policy on every surface and `DEBT-56` records that the web app sends `Content-Security-Policy-Report-Only` only, so nothing is blocked in the browser. The API's policy already enforces; the web half is the remaining hole, and the policy it reports has never been enforced against a real page. The app has no stylesheet and no third-party script, so this is the cheapest moment in the project's life to turn enforcement on: every later style and widget is then tested under the policy instead of after it.

## What Changes

- `apps/web/lib/security-headers.ts` sends `Content-Security-Policy` instead of `Content-Security-Policy-Report-Only`, with the same directive list it reports today.
- `WEB_CSP_MODE=report-only` restores today's header for one deploy, read at build and start time in `apps/web/next.config.ts`.
- The policy keeps `'unsafe-inline'` for scripts and styles, because Next injects an inline bootstrap and there is no nonce plumbing; the enforcement gain is real but bounded and is stated as such, not overstated.
- `apps/web/test/security-headers.test.ts` asserts the enforcing header name, the absence of the report-only one, the directive list, and both flag states.
- The change is **not done** until the manual browser checklist at the end of `tasks.md` passes on the running stack; a browser is the only thing that can prove it, and no agent in this repo has one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

`platform/http-security-controls` — the requirement "The web app sends a documented header set with a report-only policy" is **removed** and replaced, because its header states a mode that no longer exists; keeping it under `MODIFIED` would leave a title that contradicts its own body. See the delta for the verbatim old block, the reason and the migration.

## Impact

- **Code**: `apps/web/lib/security-headers.ts` (header key, mode selection), `apps/web/next.config.ts` (mode read).
- **Tests**: `apps/web/test/security-headers.test.ts`.
- **API/contract**: none. No API route, no OpenAPI row, no matrix row, no body key.
- **Data**: none.
- **Docs**: `docs/security-requirements.md` (`SEC-API-3` web half annotated as built for the pilot policy), `docs/known-debt.md` (`DEBT-56` closed, with one new row for nonce-based script policy if the owner wants it), `docs/local-setup.md` (`WEB_CSP_MODE`), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `security-headers-csp-cors` (archived 2026-11-13): the header set, the directive list and `DEBT-56`.
- `pwa-install-metadata` (archived 2026-11-12): the manifest and icon headers the policy must keep working.

## Out of scope

- The API-side policy, which already enforces.
- A CORS allowlist (`DEBT-57`).
- Nonce or hash-based `script-src`, which needs a middleware, a per-request nonce and a change to how Next renders; recorded as debt, not built here.
- `Trusted Types`, `require-trusted-types-for`, and reporting endpoints (`report-uri`/`report-to`).
- Any styling or layout change.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The Google sign-in callback relay breaks under enforcement | The checklist covers the full start → consent → callback → session flow, and the relay is same-origin `connect-src`/`form-action`, which the policy already allows |
| Next's inline bootstrap is blocked | The policy keeps `'unsafe-inline'` for `script-src`, which is exactly why it does; if a future Next build switches to a nonce, the manual pass catches it |
| A violation only appears on a route nobody checks | The browser console check is part of the checklist for every route in it, and `WEB_CSP_MODE=report-only` is one restart away |
| Enforcing a weak policy reads as "CSP done" | The proposal and `SEC-API-3`'s annotation both state that inline scripts remain allowed, so the pilot's claim is bounded |

Rollback: set `WEB_CSP_MODE=report-only` and restart the web container. No code change, no data change.
