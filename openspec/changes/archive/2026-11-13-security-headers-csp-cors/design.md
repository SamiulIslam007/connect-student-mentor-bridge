# Design: security-headers-csp-cors

## Context

**Repository snapshot (verified 2026-11-12, re-check at apply).**

- `main` is at `3c8c571`, clean, 37 specs valid; CI run `43208893367` succeeded. No gate run in this propose round.
- `services/api/src/main.ts` is 23 lines: it creates the Nest app with `bodyParser: false`, applies the JSON body parser with `API_MAX_BODY_BYTES`, enables shutdown hooks and listens on `0.0.0.0:3001`. No header middleware, no `enableCors`, no global prefix beyond the controllers' own `v1` paths.
- `apps/web/next.config.ts` is 21 lines: `output`, one rewrite for the Google callback, `outputFileTracingRoot`, `transpilePackages` and `watchOptions`. No `headers()` function.
- `services/api/package.json` lists no `helmet` and no `cors`; `apps/web/package.json` lists `next`, `react`, `react-dom` and `@connect/config`.
- `services/api/test/health.http.test.ts` (103 lines) already starts the app and makes real HTTP calls, so a header assertion has a home that needs no new harness.
- Every web page reaches the API through a BFF route under `apps/web/app/api/`, server-side, so a browser never makes a cross-origin request to `:3001`.
- `docs/security-requirements.md` lines 116-118 carry the three Must rows; none appears in `docs/known-debt.md`.

**Library behaviour:** `helmet` is the owner's named choice. Its middleware sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` (or the CSP frame directive), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and removes `X-Powered-By` by default. The version is pinned at apply with `pnpm --filter api add helmet@latest` and recorded in the PR body; no option in this design depends on a version newer than the last two majors.

## Goals / Non-Goals

**Goals**

- Every response from both surfaces carries a documented header set.
- The cross-origin rule is explicit and testable: the API accepts no browser origin.
- The three Must rows stop being silently unmet, and the two remaining gaps are on the register.

**Non-Goals**

- No CSP enforcement on the web app this round, no CSRF token, no hosting or TLS work.

## Decisions

The brief fixed helmet, the report-only web CSP and the CSRF acceptance; decisions taken here carry `R` numbers.

### R1. Helmet with a strict policy, configured in one module

`services/api/src/http/security-headers.ts` exports the helmet options and `main.ts` applies `app.use(helmet(options))`. The CSP is `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, which is correct for an API that returns JSON and nothing else. Alternative rejected: helmet's defaults, which include `script-src 'self'` and a `Cross-Origin-Resource-Policy: same-origin` that says something about a document this app never serves.

### R2. No CORS middleware, and the absence is the policy

The API emits no `Access-Control-Allow-Origin` header for any origin, which is what "restricted to known origins" means when the known set is empty. Alternative rejected: an allowlist containing the web origin, which would grant a capability nothing uses and which the brief's own architecture note contradicts (the BFF exists so the browser never talks to the API). The test asserts the header is absent for a request carrying an `Origin`, so a future `enableCors()` without a decision fails CI.

### R3. The web CSP is report-only, and the header set is data

`apps/web/lib/security-headers.ts` exports the header map (`Content-Security-Policy-Report-Only`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`), and `next.config.ts` `headers()` returns it for `/(.*)`. Making it data is what makes it testable without a server. Alternative rejected: writing the values inline in the config, which no test can read without executing Next's config loader.

### R4. The web CSP allows what the app actually uses and nothing else

`default-src 'self'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'` (Next injects inline styles), `script-src 'self'` plus the Next production inline bootstrap allowance expressed as `'unsafe-inline'` only in report-only mode, `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`. Tightening it further is the enforcement change's job, with a browser pass behind it. Alternative rejected: a nonce-based policy now, which needs a middleware on every route and a manual Google sign-in pass to prove it does not break the callback relay.

### R5. The API test asserts the header set, not the library

`security-headers.integration.test.ts` starts the app and asserts each documented header on a real response, and asserts the absence of `Access-Control-Allow-Origin`, `X-Powered-By` and `Content-Security-Policy-Report-Only`. Alternative rejected: a unit test over the options object, which would pass while the middleware was never applied.

### R6. Two debt rows and one accepted risk

New: "the web CSP is report-only until a manual browser pass; enforcing it is its own change", and "the API has no CORS origin allowlist because no browser-direct client exists; adding one is its own decision". `DEBT-03` is annotated as the accepted pilot boundary with the reasoning repeated. Alternative rejected: closing `DEBT-03`, which would claim a CSRF token that does not exist.

## Assumptions

1. `helmet`'s HSTS header over plain HTTP in local development is ignored by browsers and harmless; no environment gate is added, so the header set is identical everywhere and the test does not branch.
2. Next 16 honours `headers()` on the routes this app serves, including the API route handlers; the test reads the exported config rather than trusting the documentation.
3. No client reads `X-Powered-By`.

## Acceptance criteria

1. A live response from the API carries `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` and no `X-Powered-By`.
2. A live response to a request carrying `Origin: http://localhost:3000` carries no `Access-Control-Allow-Origin`.
3. `apps/web/lib/security-headers.ts` is imported by `next.config.ts` and its five keys appear in the returned map for `/(.*)`.
4. A test fails if the API's CORS header appears or if `helmet` is removed from `main.ts`, both tried and reverted.
5. `docs/security-requirements.md` annotates the three rows; `docs/known-debt.md` carries the two new rows and the `DEBT-03` annotation.
6. `pnpm test` and `pnpm build` are unchanged in count apart from the two new files.

## Risks

- A CSP on the API that names `frame-ancestors` twice (CSP and `X-Frame-Options`) is harmless but noisy; the module sets one and the test asserts both are present and consistent.
- The web's report-only policy will log violations in the browser console during manual testing; that is the point, and the enforcement change reads them.
