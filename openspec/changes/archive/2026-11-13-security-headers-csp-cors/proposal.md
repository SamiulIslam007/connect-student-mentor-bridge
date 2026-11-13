# Proposal: security-headers-csp-cors

## Why

Three Must security requirements have no code and no debt row: `SEC-API-3` ("a strict content security policy is set"), `SEC-API-4` ("HSTS, X-Content-Type-Options, Referrer-Policy, frame protection") and `SEC-API-5` ("CORS is restricted to known origins"). `services/api/src/main.ts` sets no header middleware and no CORS at all, and `apps/web/next.config.ts` sets no `headers()` — so the API answers with nothing, the web app answers with Next's defaults, and a security review fails on all three regardless of the functional score. Nothing recorded the gap, which is why it survived eight changes.

## What Changes

- API: add `helmet` and enable it in `services/api/src/main.ts` with a strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame protection and `X-Powered-By` off.
- API CORS: the browser never calls the API — every call goes through the web BFF on the same origin — so the known origin set is empty and the API emits no `Access-Control-Allow-*` header. That is the restriction, and it is asserted rather than assumed.
- Web: add a `headers()` block to `apps/web/next.config.ts` with `X-Content-Type-Options`, `Referrer-Policy`, frame protection, a `Permissions-Policy`, and a **report-only** Content-Security-Policy this round; enforcing it is a follow-up after a manual browser pass.
- Tests: an API integration test clamping the header set and the absent CORS header, and a web test freezing the config's header map.
- Record `DEBT-03` (no CSRF token; `SameSite=Lax` is the pilot boundary) as the accepted risk it already is, and add two debt rows: enforce the web CSP after the manual pass, and add a CORS origin allowlist only if a browser-direct client ever exists.
- Add the missing register rows so the three controls are tracked from now on.

## Capabilities

### New Capabilities

- `platform/http-security-controls`: the header, CSP and cross-origin contract for both surfaces, so a later change extends one set rather than re-deciding what a browser may do.

### Modified Capabilities

None. `platform/request-validation` and `platform/health-endpoints` do not state anything about headers.

## Impact

- **Code**: `services/api/src/main.ts` (the middleware), `services/api/src/http/security-headers.ts` (new, the helmet options in one place), `apps/web/next.config.ts` (the `headers()` block), `apps/web/lib/security-headers.ts` (new, the header map as data so it is testable).
- **Tests**: new `services/api/test/security-headers.integration.test.ts`, new `apps/web/test/security-headers.test.ts`; the existing `health.http.test.ts` is unchanged.
- **API/contract**: no route or schema change; `docs/api-contracts.md` gains a section stating the header set and the empty CORS allowlist.
- **Data**: none.
- **Dependencies**: one new API dependency, `helmet`, pinned at apply.
- **Docs**: `docs/security-requirements.md` (`SEC-API-3`, `SEC-API-4`, `SEC-API-5` annotated built where they are, with the CSP's report-only state named), `docs/known-debt.md` (two new rows, `DEBT-03` annotated as accepted), `docs/api-contracts.md`, `docs/system-architecture.md` (the trust boundary note), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `bootstrap-monorepo-and-docker` (archived 2026-10-29): the two apps and `main.ts`.
- `platform/health-endpoints` (archived 2026-10-29): the live-HTTP test this one sits beside.

## Out of scope

- Enforcing the web CSP: report-only this round by decision, because a strict policy can break the Google sign-in relay and the inline styles without a browser pass to prove it.
- A CSRF token (`DEBT-03`): `SameSite=Lax` stays the pilot boundary and the row stays open.
- TLS termination, HSTS preload, certificate management — hosting is undecided.
- A CORS allowlist for a browser-direct client: none exists.
- Rate limiting, body caps and validation, which already ship.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A strict API CSP breaks a client | The API serves JSON only; the policy is `default-src 'none'` with `frame-ancestors 'none'`, and the test asserts a real response carries it |
| A web CSP in report-only mode is mistaken for enforcement | The header name is the report-only one, the capability spec says so, a debt row names the enforcement step, and the register annotation repeats it |
| Helmet's defaults break better-auth's callbacks or the web BFF | Helmet only sets response headers; the BFF reads a body and a cookie, and the integration suite plus the live sign-in path are the check. Any conflict is resolved by narrowing the header, not by removing helmet |
| Removing `X-Powered-By` breaks a probe | Nothing reads it; a grep proves it |
| A CORS-free API is later called from a browser and fails opaquely | `docs/api-contracts.md` states the BFF-only rule and the debt row names the change that would add an allowlist |

Rollback: revert `main.ts`, the two new modules and the `next.config.ts` block, and drop the dependency. No data or contract state changes.

**Traces to** SEC-API-3, SEC-API-4, SEC-API-5 (Must), SEC-AUTH-4 (CSRF, unchanged and accepted); ADR-001 (the two-app split this relies on); DEBT-03 (accepted), and the two rows this change opens.
