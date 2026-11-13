# Tasks: security-headers-csp-cors

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `cat services/api/src/main.ts`, `cat apps/web/next.config.ts`, `grep -n "helmet\|cors" services/api/package.json apps/web/package.json`, `sed -n '1,40p' services/api/test/health.http.test.ts`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Read the installed Next version's `headers()` typing from `node_modules/next/dist/**` before writing the config (not from memory), and record the exact shape in this file. Verify: the recorded shape compiles.
- [x] 0.3 Grep for anything that reads `X-Powered-By` or sets headers already: `grep -rn "X-Powered-By\|setHeader\|res.header" services/api/src apps/web --include=*.ts`. Verify: the list is empty or each hit is listed in the handoff.

## 1. The API

- [x] 1.1 Add `helmet` with `pnpm --filter api add helmet` and record the resolved version in the PR body. Verify: `grep -n '"helmet"' services/api/package.json` shows an exact version, and the lockfile changed only for that dependency.
- [x] 1.2 Add `services/api/src/http/security-headers.ts` exporting the helmet options per `design.md` R1 (a strict policy, HSTS, nosniff, referrer policy, frame protection, `X-Powered-By` off), and apply it in `main.ts` before the body parser. Verify: `pnpm --filter api typecheck` passes.
- [x] 1.3 Do not call `enableCors`. Add the one-line comment stating why the allowlist is empty and naming the spec requirement. Verify: `grep -rn "enableCors" services/api/src` returns nothing.
- [x] 1.4 Add `services/api/test/security-headers.integration.test.ts` using the same app-start helper as `health.http.test.ts`: assert the five headers on a `200`, on a `401` and on a `422`; assert no `X-Powered-By`, no `Content-Security-Policy-Report-Only`; and send an `Origin` and a preflight `OPTIONS` and assert no allow header. Verify: the file passes and each assertion names its header.

## 2. The web app

- [x] 2.1 Add `apps/web/lib/security-headers.ts` exporting the header map and the path matcher, per `design.md` R3-R4. Verify: `pnpm --filter web typecheck` passes and the module imports nothing.
- [x] 2.2 Wire it in `apps/web/next.config.ts` through `headers()`, keeping the existing rewrites untouched. Verify: `pnpm --filter web build` succeeds and the build output does not warn about the config.
- [x] 2.3 Add `apps/web/test/security-headers.test.ts`: import the map and assert the five keys, the report-only header name, the absence of an enforcing policy key, and that the policy string contains the four directives `design.md` R4 names. Verify: removing one header from the map makes the test fail, then restore.

## 3. Prove the controls bite

- [x] 3.1 Remove the helmet application in a scratch edit and confirm 1.4 fails, naming the missing header. Record the observed failure in this file, then revert.
- [x] 3.2 Add `app.enableCors()` in a scratch edit and confirm 1.4 fails on the allow header. Record the observed failure, then revert.

## 4. Docs and register

- [x] 4.1 Annotate `docs/security-requirements.md`: `SEC-API-3` built for the API and report-only on the web, naming the enforcement debt row; `SEC-API-4` built on both; `SEC-API-5` built as an empty allowlist with the reason.
- [x] 4.2 Add the two debt rows to `docs/known-debt.md` (enforce the web CSP after a manual browser pass; add a CORS allowlist only if a browser-direct client exists) and annotate `DEBT-03` as the accepted pilot boundary. Do not close `DEBT-03`.
- [x] 4.3 Update `docs/api-contracts.md` with a header section (the set, the empty CORS rule, the BFF-only reason) and `docs/system-architecture.md` with the one-line trust-boundary note.
- [x] 4.4 Add the decision rows to `docs/decision-log.md` (full text at the end of this file), and update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 5. Gates, review and handoff

- [x] 5.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. Record per-package totals and confirm the dependency audit still passes (`pnpm audit --audit-level high`, which the CI security job runs).
- [x] 5.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, the silent-failure hunt, the trust-rule check, and an independent second review over the header set and the empty CORS rule.
- [x] 5.3 Handoff: the two new modules, the dependency and its version, the observed failures from 3.1 and 3.2, the four gate totals, the three register annotations, the two debt rows opened and `DEBT-03` left open.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: The API sends a strict header set through `helmet` with a policy that forbids scripts, frames and forms; the options live in one module and the header set is the same in every environment.
- Decision: The API accepts no browser origin because the browser never calls it; the absence of a cross-origin allow header is the restriction and a test fails if CORS is enabled without a new decision.
- Decision: The web app's content security policy ships report-only; enforcing it is its own change behind a manual browser pass, and a debt row holds the step.
- Decision: No CSRF token this round; `SameSite=Lax` stays the pilot boundary and `DEBT-03` stays open.
- Affects: `platform/http-security-controls`, `docs/api-contracts.md`, `docs/security-requirements.md`, `docs/known-debt.md`

## Apply record (2026-11-13)

- **0.1 confirmed**: `main` was `5e16c0d`, tree clean apart from five unapplied change directories; `main.ts` created the app with `bodyParser: false` and set the 100 KiB parser limit; `next.config.ts` already had `rewrites()`; neither package declared `helmet` or `cors`; `health.http.test.ts` builds its own module and `NestFactory.create`.
- **0.2 the installed shape** (read from `node_modules/.pnpm/next@16.4.3/.../config-shared.d.ts` and `load-custom-routes.d.ts`, not from memory): `headers?(): Promise<Array<{ source: string; basePath?: false; locale?: false; headers: Array<{ key: string; value: string }> }>>`. The config returns one entry with `source: "/(.*)"` and a spread of `WEB_SECURITY_HEADERS`.
- **0.3 nothing sets headers today**: `grep -rn "X-Powered-By\|setHeader\|res.header" services/api/src apps/web --include=*.ts` returns nothing, so `hidePoweredBy` is the only writer of that header's absence.
- **1.1 helmet resolved at `8.3.0`** and is pinned exactly (`"helmet": "8.3.0"`); the lockfile changed for that dependency only, and `pnpm audit --audit-level high` still passes.
- **3.1 mutation**: deleting `app.use(apiSecurityHeaders)` from `main.ts` failed the suite with `AssertionError: main.ts applies the header set`. The first attempt at this test only proved the module (it applied helmet itself), so a fifth test reads `main.ts` and asserts the call and its position before `useBodyParser` — without it, deleting the line left every header assertion green.
- **3.2 mutation**: adding `app.enableCors()` failed the suite with `AssertionError: no CORS allowlist is enabled`; reverted, and `grep -c enableCors services/api/src/main.ts` is 0.
- **Test shape**: `security-headers.integration.test.ts` starts its own module with two throw routes (`UnauthorizedException`, `UnprocessableEntityException`) so the header set is asserted on a `200`, a `401` and a `422`, plus a preflight with `Origin` and `Access-Control-Request-Method`.
- **5.1 gates**: see the handoff line below.
