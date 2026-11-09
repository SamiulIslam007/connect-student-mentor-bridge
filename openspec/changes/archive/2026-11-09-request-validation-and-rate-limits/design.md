# Design: request-validation-and-rate-limits

## Repository snapshot (verified 2026-11-09, re-check at apply)

- `services/api/src/main.ts` is 20 lines: `NestFactory.create(AppModule)` + `enableShutdownHooks()` + `listen`. No `useGlobalPipes`, no `useGlobalFilters` beyond the module-provided filter, no helmet, no CORS, no body limit.
- No schema library is installed: `grep -rn "zod" services/api/package.json packages/contracts/package.json` returns nothing, and `grep -rn "safeParse\|ValidationPipe" services/api/src` returns nothing. Bodies are parsed by hand, e.g. `services/api/src/requests/requests.controller.ts:19-73` (`bodyRecord`, `textOf`, `timeframeOf`), which returns `undefined` for anything it does not know.
- Unknown properties are currently ignored **and tested as such**: `services/api/test/roles.integration.test.ts`, `profiles.integration.test.ts` ("a body user_id and identity documents are ignored and never stored"), `availability.integration.test.ts`, `affiliations.integration.test.ts`, `outcomes.integration.test.ts`. Five archived specs promise the same (`identity/role-authorization`, `profiles/student-and-mentor-profiles` twice, `profiles/availability-and-access-mode`, `institutions/affiliation-verification`, `mentorship/outcome-verification` twice).
- `account_status` is contract-documented as accepted and ignored (`packages/contracts/openapi.yaml:424` prose, and `packages/contracts/test/openapi.test.ts:221` asserts it). It must keep succeeding.
- No throttling exists: `grep -rni "throttle\|rate.limit" services/api/src` returns nothing. `services/api/src/http/problem-details.filter.ts:18` maps `VALIDATION_ERROR` to `422 VALIDATION_FAILED`; `:28` maps `MFA_REQUIRED`; there is no `429` mapping.
- The web BFF already caps a body at `BFF_MAX_BODY_BYTES` (`apps/web/lib/bff.ts:63`), and the API has no equivalent.
- `@nestjs/throttler` latest is `6.7.1` and its peer range includes `@nestjs/common@12`; the API pins `@nestjs/common@12.3.2` and adds dependencies with exact versions.
- Gates on 2026-11-09 with Docker up and `CI=true`: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` 0 — domain 87, web 102, contracts 16, api 175 tests, 0 skipped, 0 failed.

## Goals / Non-Goals

**Goals**

- One guard that refuses any body property a route's contract does not define, naming it.
- A throttle on the routes that cost the most when abused, with a refusal a client can act on.
- The three open security debts closed with tests, not prose.

**Non-Goals**

- A schema library, DTO classes, or a controller refactor.
- `helmet`, CSP, or CORS.
- Per-account quotas, CAPTCHA, IP reputation.
- Any change to authentication, sessions, or authorization semantics.

## Decisions

**D1 — One shared guard, allowlist per route, no schema library.** `services/api/src/http/request-body.ts` exports `bodyKeys(body, allowed)` that (a) refuses a non-object body, (b) collects every top-level key not in `allowed`, and (c) throws `IdentityError("VALIDATION_ERROR", "unknown property: <name>")`. Each controller passes a frozen constant of its documented keys. Rejected: zod or `class-validator` — the owner fixed "no zod refactor", and the keys are already written down in the OpenAPI file.

**D2 — The allowlist is the contract, and a test keeps them equal.** Each route's constant is asserted against the OpenAPI request schema's `properties` in `packages/contracts/test/openapi.test.ts` (a route with no schema fails the test). This is the same parity idea the repo already uses for path inventories, and it stops the allowlist from drifting away from the contract silently.

**D3 — `account_status` is the only tolerated property.** It is documented as an accepted no-op and a contract test asserts it; refusing it would break the contract this change is trying to enforce. Every other undocumented key — `user_id`, `student_id`, `mentor_id`, `role`, `roles`, `actor_role`, `field_id`, `nid`, `passport_number` — is refused. The rule is "documented, or refused", not "harmless, or refused". Rejected: keep ignoring actor ids because the tests assert it — refusing is strictly stronger, and the owner chose refusal.

**D4 — The guard runs before any field extraction, and only on routes with a body.** A refusal names the first offending key in a stable order (sorted), so a test asserts a deterministic message. Routes with no body (sign-out, pause/resume, acknowledge, complete, withdraw, confirm-held) are unchanged.

**D5 — Throttling uses `@nestjs/throttler@6.7.1` with named definitions and an in-memory store.** Two named buckets: `auth` for the four credential routes, `write` for routes that enqueue email or append ledger rows. `ThrottlerModule.forRoot` registers both; `@Throttle` decorates the routes. Rejected: a hand-rolled middleware — it would re-implement storage, headers, and per-route config for no gain, and the dependency is the standard Nest one.

**D6 — The key is IP **and** account where an account is available.** The auth routes key on `req.ip` before a session exists and, once a body names an email, on that email lowercased — hashed with a fixed salt so no address is stored in a metric or a log. Session-bearing writes key on the session's account id. Rejected: IP only — a credential-stuffing run from one address against many accounts is already covered by the IP bucket, and the account bucket covers the distributed case.

**D7 — Limits are configuration with starting values (MATH-FLAG-adjacent, SEC-O2 stays Open).** `packages/config/src/index.ts` holds `RATE_LIMITS = { auth: { limit: 5, windowMs: 60_000 }, register: { limit: 3, windowMs: 3_600_000 }, reset: { limit: 3, windowMs: 3_600_000 }, write: { limit: 60, windowMs: 60_000 }, default: { limit: 120, windowMs: 60_000 } }`, each commented as a starting value pending pilot traffic, because `docs/api-contracts.md` §9 marks concrete values **Open (SEC-O2)**. Rejected: leaving every route at one global limit — sign-in and message-posting have different abuse costs.

**D8 — The `429` shape is produced in one place.** The throttler throws `ThrottlerException`; `problem-details.filter.ts` maps it to `429 RATE_LIMITED` with `Retry-After` taken from the throttler's block duration. The identity library's own `429` is translated in `better-auth-identity.service.ts`'s error mapping to the same `IdentityError` code, so `DEBT-12` closes without a second filter. Rejected: letting the library surface as `500` and documenting it.

**D9 — `helmet` and CORS are out, and the reason is recorded.** The browser only calls the same-origin BFF (`apps/web` route handlers call the API server-side), so a CORS policy has no consumer today; security headers belong to the web app's responses, not the API's JSON. Both are listed as an open question for the owner in the handoff instead of widening this change. Rejected: bundling `helmet` — it is a one-line change but a separate concern with its own verification (CSP would break Next's inline scripts).

**D10 — No migration.** No column, table, enum, index, or grant changes. The next migration number stays `0015` unless `platform-review-queue` takes it first.

## Route inventory the guard touches

| Controller | Routes with a body | Documented keys |
|---|---|---|
| `identity/auth.controller.ts` | `POST /v1/auth/register`, `sign-in`, `mfa/enroll`, `mfa/verify`, `mfa/disable`, `sign-in/provider`, `provider/callback`, `forgot-password`, `reset-password` | `email`, `password`, `date_of_birth`, `timezone`, `account_status`, `code`, `challenge`, `provider`, `redirect_path`, `state`, `token`, `backup_code` |
| `me/me.controller.ts` | `POST /v1/me/deactivate` | `password` |
| `me/roles.controller.ts` | `POST /v1/me/roles/mentor` | none (body must be empty or absent) |
| `profiles/profiles.controller.ts` | `PUT /v1/me/student-profile`, `PUT /v1/me/mentor-profile`, `POST .../pause`, `POST .../resume` | `goals`, `primary_field`, `interest_fields`, `languages`, `headline`, `bio`, `expertise_summary`, `scope_statement`, `additional_fields`, `weekly_capacity`, `access_mode`, `account_status` |
| `affiliations/affiliations.controller.ts` | `POST /v1/me/affiliations` | `institution_id`, `kind`, `department`, `program`, `batch_year` |
| `availability/availability.controller.ts` | `PUT /v1/me/availability` | `context`, `windows` (`weekday`, `start_minute`, `end_minute`), `timezone` |
| `requests/requests.controller.ts` | `POST /v1/requests`, `POST /v1/requests/:id/{accept,decline,withdraw}` | `mentor_id`, `question`, `context_summary`, `target_outcome`, `expected_timeframe`, `interaction_type`, `application_note`, `note`, `reason` |
| `mentorships/mentorships.controller.ts` | `PUT /:id/agreement`, `POST /:id/messages`, `POST /:id/sessions` | `cadence`, `planned_weeks`, `goal`, `text`, `scheduled_start`, `duration_minutes`, `meeting_url` |
| `sessions` (`mentorships.controller.ts:186`) | `POST /v1/sessions/:id/cancel` | `reason` |
| `outcomes/outcomes.controller.ts` | `POST /v1/outcomes`, `:id/confirm`, `:id/dispute`, `:id/withdraw` | `mentorship_id`, `outcome_type`, `description`, `contribution_claimed`, `title`, `occurred_on`, `contribution_level_confirmed`, `coi_declaration`, `reason` |

The authoritative key list is read from `packages/contracts/openapi.yaml` at apply; this table is the snapshot and any difference is a finding, not a licence to guess.

## Throttled routes and starting values

| Route | Bucket | Limit |
|---|---|---|
| `POST /v1/auth/sign-in` | auth | 5 per minute per IP and per account |
| `POST /v1/auth/register` | register | 3 per hour per IP |
| `POST /v1/auth/forgot-password`, `reset-password` | reset | 3 per hour per account and per IP |
| `POST /v1/requests`, `/v1/mentorships/:id/messages`, `/v1/outcomes`, `/v1/outcomes/:id/{confirm,dispute}` | write | 60 per minute per account |
| every other route | default | 120 per minute per account or IP |
| `GET /healthz`, `GET /readyz` | — | unthrottled |

## Assumptions

- `req.ip` is the real client address behind the future proxy; `trust proxy` is not configured today and is a deployment concern, not this change's.
- The auth routes do not yet return a session for a refused sign-in, so throttling cannot create a half-authenticated state.
- The 175-test API suite stays green after the five "ignored property" tests are rewritten as refusals; each rewrite is a spec-mandated behaviour change, not a test adjustment to make a failure disappear.

## Risks

| Risk | Mitigation |
|---|---|
| A rewritten test hides a real authorization regression | Each rewrite keeps the "B's profile is unchanged" assertion and only changes the status code and the code name |
| The allowlist is incomplete for a route and a legitimate field is refused | The contract-parity test compares the constant with the OpenAPI schema; the BFF forwards only documented keys; the E2E happy path is exercised on the local stack |
| The in-memory store makes the limit per instance | Documented; single instance in the pilot; a shared store is a post-pilot decision |
| A throttle interferes with the sweeper or the worker | Only HTTP routes are decorated; the worker boots no HTTP server |
| The `Retry-After` value is wrong | Taken from the throttler's block duration and asserted in a test |
