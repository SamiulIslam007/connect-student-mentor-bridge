# Tasks

## 1. Schema and grants

- [x] 1.1 Add `twoFactorEnabled` to `users` and the library-shaped `two_factors` table (`secret`, `backup_codes`, `user_id`, `verified`, `failed_verification_count`, `locked_until`, timestamps) in `services/api/src/db/schema/auth.ts`, matching `better-auth` 1.7.15 `dist/plugins/two-factor/schema.d.mts`. Verify: `pnpm --filter api typecheck` passes and the column list matches the plugin schema line for line.
- [x] 1.2 Generate migration `0005_*` with `pnpm --filter api db:generate`, then add `SELECT, INSERT, UPDATE, DELETE` grants on `two_factors` to `connect_app` in the same reviewed file. Verify: `pnpm --filter api db:migrate` applies twice with the second run a no-op, and a `SET ROLE connect_app` test reads and writes the table.

## 2. Second factor

- [x] 2.1 Register `twoFactor({ issuer: "connect" })` in `createIdentityAuth` and add the `MFA_*` actions to the `AuditAction` union. Verify: an integration test reads `users.two_factor_enabled` and the `two_factors` row created by enrollment.
- [x] 2.2 Implement `enrollMfa` (password-confirmed, returns `totpUri` and backup codes once) in `BetterAuthIdentityService`, with audit entry `MFA_ENROLLED` carrying no secret. Verify: integration tests for a valid enrollment (URI + 8 backup codes, factor not yet active), a wrong password (`422 VALIDATION_FAILED`, no row), and no secret/URI/code in any audit row or response after enrollment.
- [x] 2.3 Implement `verifyMfa` for both the enrollment step (session bearer) and the sign-in challenge (`mfa_challenge`), returning the session token the library issues. Verify: integration tests for a valid enrollment code (factor active), a valid challenge code (session works), a replayed challenge (`401`), a tampered challenge (`401`), a wrong code (`401`), and an unused backup code (works once, refused the second time).
- [x] 2.4 Hold the password sign-in at the second step: call `signInEmail` with `returnHeaders: true`, detect `twoFactorRedirect`, and return `{ mfaRequired: true, challenge }` with no session row created. Verify: an integration test asserts zero session rows after the challenge, and that a sign-in without an enrolled factor still returns a session.
- [x] 2.5 Implement `disableMfa` (password-confirmed, deletes the factor and backup codes) with audit entry `MFA_DISABLED`. Verify: integration tests for a valid disable (next sign-in returns a session, no challenge) and a wrong password (`422`, factor still active).
- [x] 2.6 Confirm the attempt limits the plugin applies (per-path rate limit, per-challenge counter, account lockout) and record the observed limits in `design.md`. Verify: a test submits wrong codes past the per-challenge allowance and asserts the challenge is refused.

## 3. Sessions

- [x] 3.1 Implement `listSessions` from the `sessions` table for the caller only (`expires_at > now()`), returning `id`, `created_at`, `updated_at`, `expires_at`, `ip_address`, `user_agent`, and `current`, never the token. Verify: integration tests for two accounts with two sessions each (each list shows only its own, the current one is marked), an expired row omitted, and no response field containing a token value.
- [x] 3.2 Implement `revokeSession` as `DELETE WHERE id = $1 AND user_id = $2`, idempotent for the caller's own ids and `404` for another account's id, with audit entry `SESSION_REVOKED` on an actual delete. Verify: integration tests for revoke-once (row gone, next request `401`), revoke-twice (same success, one audit row), already-expired id (success), another account's id (`404`, row unchanged, no audit row), and revoking the current session.

## 4. Google sign-in

- [x] 4.1 Read `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `identity.config.ts` and register `socialProviders.google` only when both are non-empty; add the names to `.env.example` and pass them through `compose.yaml` and `compose.dev.yaml`. Verify: `docker compose config` parses, `.env.example` holds names with no values, and `git grep` finds no client id value.
- [x] 4.2 Implement the start step (`signInSocial` with `returnHeaders`, returning `{ authorizationUrl, state }`) and the `503 PROVIDER_UNAVAILABLE` refusal when the provider is unconfigured. Verify: integration tests with stub credentials for a Google authorization URL carrying the stub client id, and without credentials for the `503` and an unchanged database.
- [x] 4.3 Implement the callback step: reconstruct the library's state cookie, exchange the code, read the issued session token, and apply the same status rules. Verify: integration tests for an altered or missing state (`401`, no account, no session), an unusable code (`4xx`, never `500`), and a provider sign-in that reports the post-transition `account_status`.
- [x] 4.4 Add the `PROVIDER_UNAVAILABLE` code to the problem-details mapping and the contract. Verify: the filter returns `503` with that code and no stack trace, and `packages/contracts` lists it in the error catalog.

## 5. Transport and UI

- [x] 5.1 Add BFF route handlers in `apps/web/app/api/auth/` for the provider start, provider callback, MFA enroll, MFA verify, MFA disable, session list, and session revoke, keeping `mfa_challenge` in a short-lived httpOnly cookie and clearing the session cookie when the revoked session is the current one. Verify: route tests assert the cookie flags, that no route returns a token in the body, and that the callback route sets the session cookie on success.
- [x] 5.2 Add the MFA challenge page (code entry) and the session list page with copy from `apps/web/lib/strings.ts`. Verify: `pnpm --filter web build` passes and both pages render the loading, error, and success states.

## 6. Contracts and docs

- [x] 6.1 Add the new paths to `packages/contracts/openapi.yaml` and `docs/api-contracts.md` (`sign-in/provider`, `provider/callback`, `mfa/enroll`, `mfa/verify`, `mfa/disable`, `me/sessions`, `me/sessions/{id}`), including the `mfa_required` sign-in response shape and `PROVIDER_UNAVAILABLE`. Verify: every implemented route appears in the OpenAPI document and the contract test passes.
- [x] 6.2 Update `docs/data-model.md` (`users.two_factor_enabled`, `two_factors`, `sessions` fields used by the list), `docs/auth-and-access-control.md` (§4.5 MFA, §5 sessions, §6 seam methods), `docs/security-requirements.md` (SEC-AUTH-2 and SEC-AUTH-5 evidence), `docs/known-debt.md` (the 4c split), `docs/milestones-and-phases.md` and `docs/mvp-build-plan.md` (change 4a `DONE`, 4c added), and `docs/decision-log.md` (new rows for the challenge relay, the provider gate, and the scope split). Verify: `openspec validate --all --strict` passes and no live document still calls 4a unbuilt.

## 7. Integration, review, and handoff

- [x] 7.1 On a clean volume, run `docker compose down -v`, `up -d --build`, `db:migrate` twice, `db:seed` twice, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Verify: all gates exit 0, the second migrate is a no-op, and the test run reports 0 skipped.
- [x] 7.2 Run the review gate on the diff: `/ponytail-review`, the silent-failure and trust-rule checks, and a diff-scope check. Verify: every finding is fixed in scope or recorded in `docs/known-debt.md` with a reason.
- [x] 7.3 Record the apply evidence in the change handoff: test counts, the migration pair, the observed MFA limit, and the still-blocked item (a real Google sign-in needs owner credentials). Verify: every claim cites a command run in this session.

## Workflow follow-up

- Archive only when the owner asks: `/ce-compound`, the memory update, `openspec archive`, and `openspec validate --archived --strict`.
- Git lifecycle from `.hermes.md` §7: push the branch, open the PR, wait for green `checks`/`images`/`security`, merge with `gh pr merge <n> --merge --delete-branch`, and paste the raw `git log --oneline -3` from `main`.
