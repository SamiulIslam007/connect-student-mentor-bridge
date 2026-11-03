# Tasks

## 1. Domain seam, error codes, and the status rule

- [x] 1.1 Add `EMAIL_NOT_VERIFIED` and `ACCOUNT_SUSPENDED` to `IdentityErrorCode`, plus `ActivateAccountInput`, `SuspendAccountInput`, `DeactivateAccountInput`, and the `activateAccount`, `suspendAccount`, `deactivateAccount` members of `IdentityService` in `packages/domain/src/identity.ts`. Verify `pnpm --filter @connect/domain typecheck` passes, `pnpm lint` still keeps the package free of driver and framework imports, and a test asserts a second fake implementation satisfies the widened interface.
- [x] 1.2 Add a pure decision function (`account-status.ts`) that maps a current `AccountStatus` to one of: allowed, activate-then-allow, refuse with `EMAIL_NOT_VERIFIED`, refuse with `ACCOUNT_SUSPENDED`, refuse with `FORBIDDEN`. Verify unit tests cover all six status values, including that `SUSPENDED`, `DELETION_PENDING`, and `ANONYMIZED` never return the activate branch.

## 2. Activation and the session invariant

- [x] 2.1 Turn on `emailAndPassword.requireEmailVerification` and `emailVerification.sendOnSignIn` in `services/api/src/identity/better-auth.ts`, and map the library's unverified sign-in rejection to `EMAIL_NOT_VERIFIED` in `signIn`. Verify an integration test asserts a `PENDING` account with the correct password gets `403 EMAIL_NOT_VERIFIED` and that `sessions` gains no row for it.
- [x] 2.2 Add `databaseHooks.session.create.before` that calls the pure decision function and throws `APIError` from `better-auth/api` for a refused status; widen the service's error mapping so a `statusCode` or a machine-readable code both resolve. Verify an integration test suspends an account, attempts sign-in with the correct password, and asserts `403 ACCOUNT_SUSPENDED` plus zero session rows for that user.
- [x] 2.3 Implement `activateAccount` as one idempotent statement (`WHERE status = 'PENDING'`) plus an `ACCOUNT_ACTIVATED` audit entry, and call it from the `afterEmailVerification` hook. Verify integration tests show verification flips the status to `ACTIVE`, reopening the same link adds no second audit entry, and activation applied to a `SUSPENDED` account leaves it `SUSPENDED`.
- [x] 2.4 Rewrite the tests that encode the old behavior: `identity.integration.test.ts` line 334 (unverified sign-in succeeds) and line 190 (status stays `PENDING` after registration) plus any other assertion that a `PENDING` account can hold a session. Verify `pnpm test` is green and a grep for an unverified sign-in success assertion finds none.

## 3. Suspension and self-deactivation

- [x] 3.1 Implement `suspendAccount` in one transaction: set `SUSPENDED`, delete every `sessions` row for the user, append an `ACCOUNT_SUSPENDED` audit entry naming the actor and the reason. No HTTP route ships in this change (the sanction console is FR-ADM-05). Verify integration tests show an open session fails with `401` on its next request, a partially failing transaction leaves the status and sessions unchanged, and no audit metadata contains a session token.
- [x] 3.2 Implement `deactivateAccount`, authorized by the session token rather than a body-supplied id, in one transaction: set `DEACTIVATED`, delete every session row, append an `ACCOUNT_DEACTIVATED` audit entry. Verify integration tests show the status changes, the caller's own session is dead on its next request, and the audit entry names the acting user.

## 4. Self-service endpoints and the API contract

- [x] 4.1 Add `services/api/src/me/` with `GET /v1/me` (account summary only: id, display name, email, `email_verified`, `account_status`, timezone) and `POST /v1/me/deactivate`, and move the private `bearerToken()` helper to `services/api/src/http/bearer.ts` so both controllers share it. Verify integration tests cover `401` without a session, that the response contains no other user's data and no profile fields, and that a successful deactivation returns `200`.
- [x] 4.2 Add both paths and the account summary schema to `packages/contracts/openapi.yaml`, add `ACCOUNT_SUSPENDED` and the two sign-in `403` responses to `docs/api-contracts.md` §10 and the sign-in row, and document that `GET /v1/me` returns the account record only. Verify by grep that every implemented route appears in `openapi.yaml` and that the error catalog lists every code the API can emit.

## 5. Blocked sign-up and the backfill migration

- [x] 5.1 Add the blocked-email lookup to registration: hash the submitted email with the existing key, find an unexpired `signup_blocks` row before the age gate runs, and refuse with `422 UNDER_MINIMUM_AGE` writing no user, consent, or audit row. Verify integration tests cover a blocked email refused whatever date of birth is submitted, an expired block allowing registration, and that no plaintext address is stored or logged.
- [x] 5.2 Add the forward-only data migration that sets `status = 'ACTIVE'` where `status = 'PENDING' AND email_verified = true`, registered so `pnpm --filter api db:migrate` applies it. Verify on the local Compose database that the query returns zero remaining rows and that a second run is a no-op.
- [x] 5.3 Update `docs/data-model.md` so the `account_status` note states the activation, suspension, and deactivation transitions and their session effects, and so the `signup_blocks` note says the block is now read at registration. Verify the documented transitions match the implemented ones and the enum still has exactly six values.

## 6. Web surfaces

- [x] 6.1 Add the `apps/web` account page and the BFF route handlers for `GET /v1/me` and deactivation, with a confirmation step, and add every new string to `apps/web/lib/strings.ts`. Verify against the Compose stack that the page shows the status, deactivation works end to end, and no token appears in client-side storage or the page source.
- [x] 6.2 Map the two new sign-in refusals to user-facing copy: `403 EMAIL_NOT_VERIFIED` offers a resend action, `403 ACCOUNT_SUSPENDED` explains the state without exposing internals. Verify by hand against an unverified and a suspended account, and that no new literal copy bypasses the string catalog.

## 7. Planning documents

- [x] 7.1 Refresh the "Current state" block in `docs/milestones-and-phases.md` and the status line in `README.md` to match what shipped, and set the change #3 row in `docs/mvp-build-plan.md` §5 to `DONE` with the archive date. Verify the current-state block stays within 12 lines and that no live document names `age-gate-and-account-status` (the decision log keeps the old name inside D-33 and D-35 as history, which is intended). *(Applied 2026-11-03: the #3 row reads `IN PROGRESS` with the gate evidence and the change name removed from the parenthetical, because the archive date cannot be stated before the owner archives. `DONE` + date is written at archive.)*
- [x] 7.2 Add a decision-log row for the deactivation-reversal rule only if the owner changes it from the Proposed default, and update `docs/architecture-decisions.md` only if the session invariant counts as architectural. Verify each new `D-xx` row is referenced from the documents it affects.
- [x] 7.3 Re-read the propose-time edits this branch already carries — FR-AUTH-08 to FR-AUTH-10 in `docs/functional-requirements.md`, the `PENDING` value in `docs/glossary.md` §8, and the lifecycle diagram in `docs/auth-and-access-control.md` §13 — and confirm each matches what was actually built. Verify with a grep that the glossary enum equals `docs/data-model.md` §4.1 and that no requirement ID is claimed but unimplemented.

## 8. Integration verification and review gate

- [x] 8.1 On a clean volume, run `docker compose up`, apply the migrations, and complete the demo end to end: register, hit sign-in before verifying (`403`), verify, sign in, read `GET /v1/me`, deactivate, sign in again, and register a blocked email. Then run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and paste the real output of each.
- [x] 8.2 Run the review gate from `AGENTS.local.md` §2 (ponytail review, code review, silent-failure hunter, trust-rule check, debt note, diff scope) and record the findings in the handoff. *(Applied 2026-11-03: the silent-failure hunter reported seven findings; five are fixed in `fc4bf22` (deactivation can no longer overwrite a suspension, a verified-but-`PENDING` account repairs itself at sign-in, activation entries carry `from_status`, the account page catches a failed deactivation, an unexpected `403` is logged rather than only relabelled). Two are recorded debt: the backfill writes no audit rows, and the status read and session insert are not one transaction.)*

## Workflow follow-up

- Confirm the deactivation-reversal default (design D5) before apply; if it is rejected, add `POST /v1/me/reactivate` and restore the `ACCOUNT_DEACTIVATED` code before starting task 3.
- Archive the change after the review gate and Samiul's approval, running `docs-sync` first.
- Push the branch, open the PR, wait for green checks, and squash-merge per `AGENTS.local.md` §6.
