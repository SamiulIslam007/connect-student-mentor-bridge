# Proposal

## Why

Sprint 1 shipped password authentication, account status, and profiles, but the access layer the plan puts in Sprint 2 is still unimplemented: `docs/api-contracts.md` §2 lists Google sign-in, MFA, the session list, and per-session revoke as "deferred to Sprint 2". Without a second factor, `#5 affiliation-and-mentor-onboarding` cannot gate mentor activation (`FR-PROF-03` requires MFA), and a leaked session can only be killed by signing out everywhere.

## What Changes

- **Google sign-in (`FR-AUTH-02`).** better-auth's provider flow behind `IdentityService`: `POST /v1/auth/sign-in/provider` returns the provider redirect URL, `POST /v1/auth/provider/callback` exchanges the authorization code for a session. The provider is registered only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both present; there is no hardcoded client id, no fallback, and no secret value in the repository. A new account created by the provider path goes through the same activation and status rules as the password path.
- **TOTP second factor (`FR-AUTH-04`, enrollment and verification).** `POST /v1/auth/mfa/enroll` (password-confirmed, returns the TOTP URI and one-time backup codes), `POST /v1/auth/mfa/verify` (verifies an enrollment code or a sign-in challenge and returns a session), `POST /v1/auth/mfa/disable` (password-confirmed). A sign-in for an account with a second factor returns an MFA challenge instead of a session. Verification attempts are rate-limited by the library's per-path limit, its per-challenge attempt counter, and its account lockout; no code, secret, or TOTP URI is ever logged or audited.
- **Session list and per-session revoke (the remainder of `FR-AUTH-05`).** `GET /v1/me/sessions` returns safe metadata only (no token, no secret), `DELETE /v1/me/sessions/{id}` is idempotent: revoking an already-revoked, expired, or unknown id of the caller's own session returns success, and another account's session id returns `404`.
- **Schema (additive, forward-only).** `users.two_factor_enabled`, a library-shaped `two_factors` table, and app-role grants on it.
- **Contracts and docs.** New paths in `packages/contracts/openapi.yaml` and `docs/api-contracts.md`, the new problem code `PROVIDER_UNAVAILABLE`, auth/session tables in `docs/data-model.md`, MFA and session behaviour in `docs/auth-and-access-control.md`, environment names in `.env.example` and `docs/local-setup.md`, decisions in `docs/decision-log.md`, and the current-state block in `docs/milestones-and-phases.md` with `docs/mvp-build-plan.md` §5.

**Scope split (owner-level cut, recorded as a decision):** role-based authorization beyond the session guard (`FR-AUTH-07`), profile visibility, and the admin idle/absolute session timeouts move to a new Sprint 2 change `roles-and-profile-visibility` (4c), ordered before `#5`. Reason: a role model with no role-protected endpoint to guard would ship untested policy, and it needs the `role_assignments` table and its consumers together. MFA enrollment/verification and session revoke — the security-sensitive half of this change — stay here.

**BREAKING:** none. Sign-in gains an alternative response shape (`mfa_required`) only for accounts that have enrolled a second factor, which is a new state.

## Capabilities

### New Capabilities

- `identity/google-signin`: sign-in with a Google account, provider account linking by verified email, and the environment-gated provider configuration.
- `identity/mfa-totp`: TOTP second-factor enrollment, verification at sign-in and during enrollment, backup codes, and disable.
- `identity/session-management`: listing the caller's active sessions and revoking one session idempotently.

### Modified Capabilities

- `identity/email-password-auth`: sign-in returns an MFA challenge instead of a session when a second factor is enrolled, and a provider sign-in obeys the same activation and status rules as the password path.

## Impact

- **Code:** `services/api` (identity module, auth controller, session controller, Drizzle schema, one migration), `packages/domain` (identity interface types and pure session/MFA input validation), `packages/contracts` (OpenAPI paths), `apps/web` (BFF routes for the new endpoints, `mfa_challenge` cookie), and the string catalog for the new UI copy.
- **Data:** two additive schema changes (`users.two_factor_enabled`, `two_factors`) plus grants. No existing row is rewritten and no column is dropped.
- **Configuration:** `.env.example` gains `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (names only); `compose.yaml` passes them through.
- **Dependencies:** none. The second factor uses the `twoFactor` plugin already inside `better-auth` 1.7.15; no package is added.
- **Blocked on the owner:** creating the Google Cloud OAuth client and dropping real values into the local environment. The code path is complete and tested against a stubbed provider exchange; only a manual end-to-end sign-in with a real Google account is blocked.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The MFA challenge is carried in the library's signed cookie, not a project token | The API relays the library's own cookie value as an opaque `mfa_challenge` and reconstructs the cookie header on verify; tests cover a valid challenge, a replayed challenge, and a tampered challenge. |
| A provider callback that trusts an unchecked `state` would allow login CSRF | The library's own signed state cookie is relayed the same way as the challenge and verified by the library; a missing or altered state is refused. |
| A new table could be created without app-role grants (the Sprint 1 audit finding) | The migration includes explicit `SELECT, INSERT, UPDATE, DELETE` grants, and an integration test runs as `connect_app`. |
| Split scope leaves `FR-AUTH-04` enforcement by role unbuilt | Recorded in `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` §5.2, and `docs/known-debt.md` with `roles-and-profile-visibility` (4c) as the owner. |

Rollback: revert the branch and drop the local volume; the schema change is additive, so an existing database keeps working if the code is reverted.
