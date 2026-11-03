# Proposal

## Why

An independent Sprint 0/1 audit found two blockers before Sprint 2: the `connect_app` role has no privileges on the five tables added by migration `0002`, and CI is green while 47 of 56 API tests skip because no database is available. It also found client validation errors returning 500, an open redirect in the verify BFF route, a malformed-cookie 500, a registration timing oracle, an append-only audit FK that rewrites history, unbounded taxonomy input, and a missing forgot-password page. Sprint 2 adds Google sign-in, MFA, and session management on the same boundary, so these must be closed first.

## What Changes

- **Plan and docs conformance (committed before the artifacts):** add change rows 4a `access-google-mfa-and-sessions`, 4b `profile-availability-and-access-mode`, and 6a `outbox-and-job-runner` without renumbering; mark Sprint 1 partials with their homes; fix stale session, contract, README, Gate 0, and decision-log wording; record D-40 to D-44; add `docs/known-debt.md`.
- **Database roles (F-01):** forward-only migration `0003` grants exactly `SELECT, INSERT, UPDATE, DELETE` on `fields`, `student_profiles`, `student_field_interests`, `mentor_profiles`, and `mentor_fields` to `connect_app`; a `SET ROLE connect_app` test exercises all four operations; local setup documents the login-role/membership step.
- **CI database tests (F-02):** the `checks` job starts `postgres:16-alpine`, creates `connect_test`, and sets `DATABASE_URL`; test support fails instead of skipping when `CI=true` and the database is unreachable; the required check names stay `checks`, `images`, `security`.
- **Audit integrity (F-08, F-16, F-20):** forward-only migration `0004` changes `audit_logs.actor_user_id` to `ON DELETE RESTRICT`; sign-in runs inside `runWithRequestId`, re-reads the account after every successful library sign-in, and revokes the new session if the success audit insert fails.
- **API security (F-05, F-07):** the email validator is aligned with the library, library 4xx errors on register/forgot/sign-in map to `422 VALIDATION_ERROR`, and the existing-email registration path performs a throwaway password hash to remove the timing oracle.
- **Web security (F-06, F-14, F-17):** the verify redirect comes from the configured app origin and allows only `http`/`https`; the BFF caps request bodies before parsing and counts chunked bytes; a malformed session cookie is treated as no session; a non-JSON upstream body becomes a `502` problem response.
- **Taxonomy (F-15):** NFKC plus `Cf` stripping, a letter-or-number requirement, a 5-field mentor cap (primary plus 4), a 5-language cap for both roles, and `GET /v1/fields` keyset pagination by slug with limit 100 (max 200).
- **Completeness (F-10, F-11, F-13):** a forgot-password page and sign-in link, a clear under-18 message on the sign-up page, and a clean-checkout `BETTER_AUTH_SECRET` step plus a boot error that says how to generate it.
- **Hygiene (F-23, F-24):** `.dockerignore` excludes local secret-bearing files; the dev-only `esbuild`/`minimatch` advisories are tracked, not fixed.

## Capabilities

### New Capabilities

- `platform/database-roles`: the application role's DML grants, append-only table privileges, login-role membership, and the test that proves the app role can use every application table.

### Modified Capabilities

- `identity/email-password-auth`: email validation and 4xx mapping, registration timing, sign-in request correlation and post-transition status, forgot-password web surface, and BFF transport hardening (configured redirect origin, cookie parsing, body cap, non-JSON 502).
- `identity/account-status-lifecycle`: the verified-`PENDING` repair reports the post-transition `ACTIVE` status and its activation audit carries the sign-in request id.
- `profiles/dynamic-fields`: format-character stripping, the letter-or-number rule, and keyset pagination by slug.
- `profiles/student-and-mentor-profiles`: the mentor 5-field total cap and the 5-language cap for students and mentors.
- `trust/consent-and-audit-records`: audit fail-closed on session creation, request-id correlation, and append-only enforcement by grants plus `ON DELETE RESTRICT`.
- `platform/ci-pipeline`: a database service in the required `checks` job and a fail-not-skip rule in CI.
- `platform/health-endpoints`: readiness resolves the database URL through the same environment/`.env` path as the database module.
- `platform/local-stack`: a clean checkout requires a generated `BETTER_AUTH_SECRET` before `docker compose up`.

## Impact

- **Schema:** forward-only migrations `0003` (grants) and `0004` (audit FK `RESTRICT`), with Drizzle snapshots and a fresh-replay test.
- **API:** `auth.controller.ts`, `better-auth-identity.service.ts`, `better-auth.ts`, `health.controller.ts`, `profiles.controller.ts`, `drizzle-profiles.service.ts`; no new runtime dependency.
- **Web:** `apps/web/lib/bff.ts`, `api.ts`, `session-cookie.ts`, `app/api/auth/verify/route.ts`, a new forgot-password page, `sign-up/page.tsx`, `strings.ts`, and the sign-in link.
- **CI/ops:** `.github/workflows/ci.yml`, `test/support/database.ts`, `docs/local-setup.md`, `.dockerignore`.
- **Contract:** `packages/contracts/openapi.yaml` for `/v1/fields` pagination and the `413`/`400` error notes; `docs/api-contracts.md`, `docs/data-model.md`.
- **Tests:** API integration, domain unit, contract, and web route tests for every behaviour above.
- **Docs:** `docs/known-debt.md`, `README.md`, `docs/milestones-and-phases.md`, `docs/mvp-build-plan.md`, `docs/decision-log.md`, `docs/non-functional-requirements.md`, `docs/security-requirements.md`, `docs/auth-and-access-control.md`, `docs/production-requirements.md`, `docs/system-architecture.md`, `docs/local-setup.md`.

## Out of Scope

- `SEC-API-1` unknown-field rejection (owner: Sprint 7, D-41).
- Rate limiting and CSRF tokens (Sprint 7).
- Google sign-in, MFA, session list/revoke (4a), availability/access mode (4b), affiliation (#5), outbox/pg-boss (6a).
- Field curation/merge/rename and cross-script confusable folding (Phase 1b; D-43).
- Privacy export and deletion, pseudonymization implementation, audit hash chain.
- SMTP retry/provider failover, malware scanning, hosting, and deployment.
- Any change to the registration age-gate policy other than documenting the accepted block-griefing risk (D-40).

## Risks

- **Timing measurement is noisy.** The acceptance is a median of 20 samples with a ratio below 1.5×; a failing run is a signal to investigate, not a deterministic unit test.
- **CI runtime grows.** The database service and 47 integration tests add about 1–2 minutes to `checks`; the required check names cannot change without a ruleset update.
- **Pagination changes the field order** from display name to normalized slug. The response gains `next_cursor`; a client that ignores it still gets a bounded first page.
- **`ON DELETE RESTRICT` blocks hard deletion** of a user with audit rows. That is the intended invariant; pseudonymization is the deletion path.
- **Stitch reference is advisory.** The generated screens are a design reference; the implementation follows the existing code and string catalog.
- **No production data exists**, so the migrations have no live backfill risk.

## Rollback

Revert the branch. Both migrations are forward-only and additive in effect: `0003` only adds grants; `0004` changes one FK action. Reverting the code leaves the database usable by the owner role. No production data or deployment exists. The propose-time doc commit can be reverted independently.

**Traces to:** FR-AUTH-01, FR-AUTH-03, FR-AUTH-05, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09; FR-PROF-01, FR-PROF-02; FR-CONS-01; FR-AUD-01; SEC-AUTH-5, SEC-API-6; SEC-API-1 (deferred, D-41); ADR-018; D-08, D-31, D-37, D-40, D-41, D-42, D-43, D-44.
