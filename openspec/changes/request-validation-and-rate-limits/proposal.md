# Proposal: request-validation-and-rate-limits

## Why

Three accepted security debts are still open and all three are Must-level: `DEBT-01` (unknown request properties are accepted and silently ignored, so `SEC-API-1` is unmet), `DEBT-02` (no rate limiting on sign-up, sign-in, password reset, or field creation), and `DEBT-12` (the identity library's own throttle surfaces as a `500`). Every controller parses its body by hand — `main.ts` installs no pipe, no filter for throttling, and no schema — so a client can send an arbitrary account-level property and nothing refuses it.

## What Changes

- One shared body guard: every controller declares the body keys its route documents, and the guard refuses any other top-level property with `422 VALIDATION_FAILED` naming it, before the existing field extraction runs. **BREAKING** for any client that sends an undocumented property: it was ignored, now it is refused.
- The one documented exception keeps working: `account_status` is contract-documented as an accepted no-op on registration and profile saves and stays tolerated.
- Rate limiting with `@nestjs/throttler` (exact `6.7.1`, in-memory store): a per-IP and per-account limit on `POST /v1/auth/register`, `sign-in`, `forgot-password`, `reset-password`, and on the write routes that enqueue email or append ledger rows; `/healthz` and `/readyz` stay unthrottled.
- A throttle refusal becomes the documented problem shape: `429 RATE_LIMITED` with `Retry-After`, and the identity library's own `429` is translated instead of returning `500`.
- The concrete window and per-route limits ship as configuration with documented starting values (SEC-O2 stays Open and is labelled a placeholder).
- Record D-78 to D-81, close DEBT-01, DEBT-02 and DEBT-12, and correct `docs/security-requirements.md` (the per-instance throttle limitation).
- No migration.

## Capabilities

### New Capabilities

- `platform/request-validation`: the API-wide body allowlist, the field-naming refusal, the documented no-op, and the body-size bound.
- `platform/rate-limits`: which routes are throttled and how they are keyed, the `429` problem shape, the configured starting values, and the per-instance limitation.

### Modified Capabilities

- `identity/role-authorization`: the "a body-supplied role is ignored" scenario becomes a refusal.
- `profiles/student-and-mentor-profiles`: both "a body user id is ignored" scenarios become refusals.
- `profiles/availability-and-access-mode`: the "only the caller's own availability" scenario becomes a refusal.
- `institutions/affiliation-verification`: the "body `user_id` is ignored" requirement becomes a refusal.
- `mentorship/outcome-verification`: the "field comes from the mentorship" and "foreign id in the body" scenarios become refusals.

Each of those five capabilities currently promises that an undocumented identifier is ignored. This change refuses it instead, which is strictly stronger, but the archived text has to change in the same change or the spec will contradict the code at archive time.

## Impact

- **Code**: `services/api/src/http/request-body.ts` (new guard), every controller with a `@Body()` route (`identity/auth.controller.ts`, `me/me.controller.ts`, `me/roles.controller.ts`, `profiles/profiles.controller.ts`, `affiliations/affiliations.controller.ts`, `availability/availability.controller.ts`, `requests/requests.controller.ts`, `mentorships/mentorships.controller.ts`, `outcomes/outcomes.controller.ts`), `services/api/src/app.module.ts` (throttler registration), `services/api/src/http/problem-details.filter.ts` (the `429` shape), `services/api/src/identity/better-auth-identity.service.ts` (the library `429` translation), `packages/config/src/index.ts` (limit constants).
- **Tests**: the five integration files whose "ignored property" cases flip (`roles`, `profiles`, `availability`, `affiliations`, `outcomes`), a new `services/api/test/request-validation.integration.test.ts`, a new `services/api/test/rate-limits.integration.test.ts`, `packages/contracts/test/openapi.test.ts` (429 responses and the allowlist parity check).
- **API/data**: `packages/contracts/openapi.yaml` gains `429` responses and the documented no-op note; no schema change, no migration.
- **Dependencies**: `@nestjs/throttler@6.7.1` (pinned, peer-compatible with `@nestjs/common@12.3.2`).
- **Docs**: `docs/security-requirements.md` (SEC-API-1 satisfied, SEC-ABUSE throttle, per-instance limitation), `docs/api-contracts.md` §9 and §10, `docs/known-debt.md` (DEBT-01, DEBT-02, DEBT-12 closed), `docs/functional-requirements.md` where it promises ignoring, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `docs/decision-log.md`, `README.md`.

## Depends on

- `identity/email-password-auth` and `identity/session-management` (archived): the auth routes the throttle protects.
- `platform/outbox-and-job-runner` (6a): the write routes whose emails a throttle protects.
- `mentorship/request-lifecycle`, `mentorship/thread-and-sessions`, `mentorship/outcome-verification` (archived): the remaining write routes and their documented bodies.
- Nothing from `mentor-directory` or `platform-review-queue`; this change is independent, and whichever of the other two lands later will use the guard from its first route.

## Out of scope

- A schema library or a controller refactor: no zod, no `class-validator`, no DTO classes.
- `helmet`, a Content-Security-Policy, and CORS configuration: `main.ts` has none today, the browser talks only to the same-origin BFF, and adding headers is a separate, reviewable change. Listed as an open question rather than smuggled in.
- Per-account quotas, IP reputation, CAPTCHA, and signup-block tuning.
- A shared (Redis) throttle store, which ADR-006 forbids in the MVP.
- Any rate limit value the owner has not approved as a starting point; the values ship labelled as placeholders.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A legitimate client breaks because it sends an extra property | The allowlist is derived from the OpenAPI schema, a contract test asserts schema properties equal the allowlist, and the web BFF forwards only documented keys; the `account_status` no-op is preserved |
| The strict rule is applied to one controller and missed on another | The guard is a single helper, the permission-matrix-style inventory test lists every `@Body()` route with its key set, and a route missing from the inventory fails the test |
| A throttle blocks a legitimate pilot user | Limits are configuration with conservative starting values, the refusal names `Retry-After`, and tuning needs no code change |
| The in-memory store is mistaken for a global limit | Documented in `docs/security-requirements.md` and in the change, with the shared-store decision named as post-pilot |
| The library's 429 still surfaces as 500 | A translation test drives a library refusal and asserts the problem shape |

Rollback: remove the guard calls and the throttler registration; the `429` mapping is harmless without it. No data is written, so rollback is safe at any time.

**Traces to** SEC-API-1 (unknown fields rejected, body bound), SEC-ABUSE-1 and SEC-ABUSE-2 (credential stuffing, bulk collection), SEC-O2 (rate-limit values remain Open; shipped values are placeholders), FR-AUTH-01 (sign-in abuse), FR-ADM-07 (limits are configuration); ADR-006 (no Redis), ADR-018 (Drizzle); D-78 to D-81 (this change's decisions); DEBT-01, DEBT-02, DEBT-12 (closed here).
