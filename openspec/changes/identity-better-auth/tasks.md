# Tasks

## 1. Dependencies and configuration

- [ ] 1.1 Add exact dependencies to `services/api/package.json` (`better-auth` 1.7.15, `@better-auth/drizzle-adapter` 1.7.15, `drizzle-orm` 0.45.4, `nodemailer` 10.3.1) and dev dependencies (`drizzle-kit` 0.31.11, `@types/nodemailer`); verify `pnpm install` succeeds, `pnpm-lock.yaml` is committed, and `pnpm audit --audit-level high` reports no new high findings.
- [ ] 1.2 Add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` names to `.env.example` and pass them through `compose.yaml` and `compose.dev.yaml`; verify `docker compose config` parses and `git grep -n "BETTER_AUTH_SECRET=" -- .env.example` shows a name with no value.

## 2. Database foundation

- [ ] 2.1 Write the Drizzle auth schema in `services/api/src/db/schema/auth.ts` with plural tables (`users`, `sessions`, `accounts`, `verifications`) and the project columns through `additionalFields` (`timezone`, `status`, `age_18_plus`, `age_gate_passed_at`, `age_gate_version`, `last_seen_at`, `anonymized_at`, all `input: false`); verify `pnpm --filter api typecheck` passes.
- [ ] 2.2 Write the project tables (`institutions`, `institution_domains`, `consent_records`, `audit_logs`, `signup_blocks`) plus the append-only grants that revoke `UPDATE`/`DELETE` on `consent_records` and `audit_logs` from the application role; verify the integration test that attempts an update and a delete on both tables receives a permission error (spec: "Consent records are append-only", "Audit entries are append-only").
- [ ] 2.3 Add `drizzle.config.ts` and generate the baseline migration under `services/api/drizzle/`; verify the migration applies cleanly to the Compose Postgres with `pnpm --filter api db:migrate` and a second run is a no-op.
- [ ] 2.4 Add `services/api/src/db/` (pooled `pg` connection, Drizzle instance, Nest provider) and wire it into `app.module.ts`; verify `/readyz` still reports ready with the database reachable and the integration test opens a transaction.

## 3. Domain seam and pure rules

- [ ] 3.1 Add the `IdentityService` interface and its types to `packages/domain`; verify `pnpm --filter @connect/domain typecheck` passes, `pnpm lint` keeps the package free of driver and framework imports, and a test asserts a second fake implementation satisfies the interface.
- [ ] 3.2 Add `isAtLeast18(dateOfBirth, now)` and the password policy to `packages/domain` with unit tests; verify tests cover the 18th birthday boundary, a leap-day birth date, an under-18 date, 11 vs 12 characters, and a 64+ character passphrase.

## 4. Identity implementation

- [ ] 4.1 Implement `BetterAuthIdentityService` in `services/api/src/identity/` with `secret`/`baseURL` from environment, `drizzleAdapter(db, { provider: "pg", usePlural: true, transaction: true })`, session `expiresIn` 30 days and `updateAge` 1 day, and no `cookieCache`; verify an integration test creates and reads a session row and that no `better-auth` import exists outside `src/identity/`.
- [ ] 4.2 Implement registration: age gate before creation, account plus two consent rows in one transaction, `PENDING` status, and an audit entry; verify integration tests for a valid registration (user + 2 consent + 1 audit row), a duplicate email, an under-18 attempt (`422 UNDER_MINIMUM_AGE`, `signup_blocks` row, no user), and that no table holds a date of birth.
- [ ] 4.3 Add the `EmailSender` interface, `SmtpEmailSender` (nodemailer), and wire `sendVerificationEmail` with `sendOnSignUp` and `expiresIn` 86400; verify an integration test records the verification email through a fake sender, that a valid link marks the account verified, that an expired link is rejected, and that a second use leaves the account verified without error.
- [ ] 4.4 Implement sign-in, sign-out, and sign-out-everywhere with audit entries for success and failure; verify integration tests that a wrong password and an unknown email return the same `401` body, that no audit metadata contains a password, hash, token, or raw email, and that sign-out-everywhere makes another session fail on its next request.
- [ ] 4.5 Implement forgot-password and reset-password with `resetPasswordTokenExpiresIn` 1800 and `revokeSessionsOnPasswordReset: true`; verify integration tests that an unknown email returns the same response as a known one, that a reset revokes all sessions, and that a reused reset token is rejected.

## 5. Transport (BFF and web)

- [ ] 5.1 Add the `apps/web` route handlers for register, verify, sign-in, and reset that call the API through `NEXT_PUBLIC_API_BASE_URL` and set an httpOnly, SameSite=Lax cookie (Secure outside development); verify a test asserts the cookie flags and that no handler returns a token in the response body.
- [ ] 5.2 Add the minimal sign-up, sign-in, verify, and reset pages with labels from the string catalog; verify the pages render and the full flow works against the Compose stack (sign up → Mailpit link → verified account → sign in → sign out everywhere).

## 6. Reference data seed

- [ ] 6.1 Add the institution seed source and an idempotent seed script; verify a test runs the seed twice and asserts identical row counts, and that a duplicate domain (including different letter case) fails loudly with no partial rows written.

## 7. Contracts and documentation

- [ ] 7.1 Add the auth paths to `packages/contracts/openapi.yaml` and `docs/api-contracts.md` (register, verify, sign-in, sign-out, forgot/reset, sign-out-everywhere) with the documented error codes; verify every implemented route appears in the OpenAPI document and `pnpm typecheck` passes.
- [ ] 7.2 Update `docs/data-model.md`: auth tables as library-native (`users` with `email_verified`, `sessions`, `accounts`, `verifications`), rename the mentorship table to `mentorship_sessions`, drop `email_verified_at` and `identity_subject`, and add `signup_blocks`/`consent_records`/`audit_logs` details; verify by grep that no doc still names the old `sessions` mentorship table or `identity_subject`.
- [ ] 7.3 Update `docs/mvp-build-plan.md` §5: add a `Status` column, narrow change #2's description to this scope, mark #1 `DONE` and #2 `IN PROGRESS` with a legend line; verify the table renders with 10 rows and every row has a status value.
- [ ] 7.4 Add the "Current state" block to the top of `docs/milestones-and-phases.md` (current sprint, last archived change, next change, blockers, date), and update `README.md`'s status line; verify the block is at most 12 lines and `README.md` matches the block's stated position.
- [ ] 7.5 Update `docs/local-setup.md` with the migration command and the two new environment variable names, and add the decision-log rows for the scope split (deferred Google/MFA/sessions) and the migration ownership; verify the documented command runs as written.

## 8. Integration verification and review gate

- [ ] 8.1 On a clean volume, run `docker compose up`, apply the migration, complete the Sprint 1 demo end to end, then run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and paste the real output of each.
- [ ] 8.2 Run the review gate from `AGENTS.local.md` §2 (ponytail review, code review, silent-failure hunter, trust-rule check, debt note, diff scope) and record findings in the handoff.

## Workflow follow-up

- Archive the change after the review gate and Samiul's approval, running `docs-sync` first.
- Push the branch, open the PR, wait for green checks, and squash-merge per `AGENTS.local.md` §6.
