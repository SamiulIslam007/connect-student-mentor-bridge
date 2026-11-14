# Proposal: csrf-token-on-cookie-writes

## Why

`SEC-AUTH-4` requires CSRF protection on cookie-authenticated writes and `DEBT-03` records that only `SameSite=Lax` stands between the pilot and a cross-site write. The browser holds one credential, the httpOnly `connect_session` cookie, and every state-changing call the pages make goes through a Next route handler that trusts that cookie. `SameSite=Lax` blocks a cross-site `POST` today, but it is a browser default rather than a check the server makes, and it does not cover a same-site subdomain or a browser that ignores the attribute.

## What Changes

- One stateless CSRF token per browser, minted server-side, delivered in a second cookie and echoed back in a header on every cookie-authenticated write.
- A shared guard in the web app checks both halves and the request `Origin`; a mismatch answers `403 CSRF_INVALID` in the problem-details shape and writes nothing.
- A single client helper owns the header, so no page hand-writes a fetch to a write endpoint.
- The API is unchanged: it authenticates by bearer token only (`apps/web/lib/bff.ts` `proxyJson` sets `authorization: Bearer …`), so it never reads a session cookie and needs no CSRF check. The CSRF boundary is the Next BFF, which is where the cookie lives.
- An environment flag can switch the check off for one deploy, so a field failure is a restart rather than a hotfix.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change adds one requirement to `platform/http-security-controls`; no existing requirement contradicts a stricter write rule. `web-csp-enforce` adds a different requirement to the same capability: two additions, two headers, no collision.

## Impact

- **Code**: new `apps/web/lib/csrf.ts` (token mint, cookie, header name, constant-time compare, `requireCsrf`, `originAllowed`); `apps/web/app/api/me/route.ts` and a new `apps/web/app/api/csrf/route.ts` issue the token; 34 write-capable route handlers under `apps/web/app/api/**` call the guard; 22 client components switch to `csrfFetch` from `apps/web/lib/csrf-client.ts`.
- **Tests**: `apps/web/test/csrf.test.ts` (mint, compare, origin, refusal shape), `apps/web/test/csrf-wiring.test.ts` (every write-capable `route.ts` calls the guard, no page posts without the helper, the five exempt auth routes are exempt and named), plus one API-side assertion that no controller reads a session cookie.
- **API/contract**: no new API route and no API change, so `packages/contracts/openapi.yaml`, `body-keys.ts`, the authorization matrix and the request-validation inventory are untouched. The BFF contract, which is not in the OpenAPI document, is documented in `docs/api-contracts.md`.
- **Data**: none. No table, no column, no migration.
- **Docs**: `docs/auth-and-access-control.md` (the browser-credential section), `docs/security-requirements.md` (`SEC-AUTH-4` annotation), `docs/api-contracts.md` (the BFF boundary), `docs/known-debt.md` (close `DEBT-03`), `docs/decision-log.md`, `docs/functional-requirements.md` (no score change), `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `account-access-ui` (archived 2026-11-05): the signed-in header and the BFF session cookie this change rides on.
- `security-headers-csp-cors` (archived 2026-11-13): the header set and the reason the web half is separate from the API.

## Out of scope

- Per-endpoint or per-form tokens, rotation on privilege change, and a server-side token table.
- Non-cookie clients: native apps, API keys, and any future browser-direct client (`DEBT-57` governs that).
- Enforcing the check inside the NestJS API, which authenticates by bearer token only.
- UI styling, and any new page or endpoint beyond `GET /api/csrf`.
- The `Secure`-cookie LAN problem (`DEBT-16`).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A page keeps writing with a plain `fetch` and starts failing in production | `csrf-wiring.test.ts` reads every `route.ts` and every `*.tsx` that writes and fails the build on a missing guard or a missing helper; the refusal names the header, so a manual pass sees the cause |
| A stale token after a session change locks a user out of writes | The token is not bound to the session id: it is a browser-scoped random value compared to itself, so a new session keeps working; the cookie is re-minted only when absent |
| `Origin` is missing on a legitimate request (an old browser, a stripped proxy header) | A missing `Origin` and `Referer` are refused only when the token half also fails; a valid token pair is accepted, which is the documented double-submit rule |
| The token cookie is not httpOnly, so a future XSS could read it | Recorded as a deliberate trade: double-submit needs a readable value; the enforcing CSP of `web-csp-enforce` is the XSS control, and the token grants nothing without the session cookie |

Rollback: set `WEB_CSRF_MODE=off` and restart; or revert the guard call in the route handlers. No data changes, no migration, and the cookie can be left to expire.
