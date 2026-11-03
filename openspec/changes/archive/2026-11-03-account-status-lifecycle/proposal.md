# Proposal

## Why

Every account created today is permanently `PENDING`: registration writes `users.status = 'PENDING'` and no code path ever moves it to `ACTIVE`. Nothing reads the status either, so a suspended or unverified account works exactly like a verified one. The `account_status` column is therefore dead data, and every capability after this one (profiles, affiliation, requests, discovery) must gate on a status that is always false.

Two related gaps ship with the same root cause. The blocked-signup policy is half-built: `signup_blocks` is written on an under-18 attempt but never read, so a changed date of birth walks straight through the gate that FR-AUTH-03 says the block exists to stop. And `profiles/profile-bootstrap` requirement 3 — "SHALL expose the account status to the account owner" — has no implementation: there is no `GET /v1/me`, and the sign-in response drops `account_status`, so the account owner cannot see their own state.

This change closes all three. It is also the last cheap moment for the `IdentityService` seam, which has one implementation and ~52 tests today; adding the lifecycle after profiles, affiliation, and discovery exist would mean revisiting every read path.

## What Changes

- **Activation:** opening the verification link moves `PENDING` to `ACTIVE`. `emailAndPassword.requireEmailVerification` is set to `true` so that only an `ACTIVE` account can sign in; an unverified account is refused with `403 EMAIL_NOT_VERIFIED` after its password is accepted.
- **Sign-in gate:** credentials are verified before status is evaluated, so a status refusal never becomes an account-existence oracle (SEC-AUTH-6).
- **Suspension:** `suspendAccount` sets `SUSPENDED` and revokes every session row for the account in one transaction; sign-in is refused with `403 ACCOUNT_SUSPENDED`. The sanction workflow, its reason, and its notification stay in FR-ADM-05 (Sprint 7); this change ships the account-level mechanics and proves them with tests, with no admin HTTP route.
- **Self-deactivation:** `POST /v1/me/deactivate` — already specified in `docs/api-contracts.md` §5.1 and never built — sets `DEACTIVATED` and revokes every session. Reversal by signing in again is recorded as a **Proposed default** pending owner confirmation.
- **Blocked sign-up:** registration checks `signup_blocks` for a live keyed hash of the submitted email before evaluating the age gate, and refuses with `422 UNDER_MINIMUM_AGE` and no account. FR-AUTH-03 already promises this behavior.
- **`GET /v1/me`:** returns the account summary for the signed-in user — id, display name, email, `email_verified`, `account_status`, timezone, and nothing else. This satisfies `profiles/profile-bootstrap` requirement 3 instead of deferring it a second time; change #4 extends the same endpoint with profile data rather than adding a competing one.
- **Seam:** `IdentityService` gains `activateAccount`, `suspendAccount`, and `deactivateAccount` in `packages/domain`, plus the `EMAIL_NOT_VERIFIED` and `ACCOUNT_SUSPENDED` error codes. `SESSION_INVALID` is not reused for either.
- **Backfill:** accounts already verified in the local database move `PENDING` -> `ACTIVE` in the same migration, so existing local test data keeps working.
- **BREAKING for unverified accounts:** sign-in that succeeds today for an unverified account will return `403 EMAIL_NOT_VERIFIED`. `identity.integration.test.ts` asserts the old behavior at line 334 and is updated; this is the intended conformance fix, not a regression.
- **Docs conformance carried by this change:** the Sprint 1 row and current-state block in `docs/milestones-and-phases.md` stop claiming that `account_status`, profile CRUD, and dynamic fields shipped in change #2; `docs/glossary.md` gains the missing `PENDING` value; `docs/auth-and-access-control.md` §13 shows the `pending -> active` transition instead of starting at `active`; `docs/functional-requirements.md` gains FR-AUTH-08 to FR-AUTH-10; `docs/mvp-build-plan.md` renames change #3 and records its status.

**Out of scope:** profile CRUD, the `fields` table, availability, and capacity (change #4); the affiliation claim flow (change #5); the admin sanction console, moderation, and break-glass (Sprint 7); account deletion, `DELETION_PENDING`, and `ANONYMIZED` (the privacy change after change #10); Google sign-in, MFA, and the session list (change #5 in the Sprint 2 sequence).

## Capabilities

### New Capabilities

- `identity/account-status-lifecycle`: the transitions between `PENDING`, `ACTIVE`, `SUSPENDED`, and `DEACTIVATED`, the sign-in gate that enforces them, the session revocation each transition performs, the audit entries they append, and the blocked-signup policy that reads `signup_blocks`.

### Modified Capabilities

- `identity/email-password-auth`: the "Email verification" requirement no longer permits sign-in for an unverified account, and the "Sign-in and sign-out" requirement gains the post-credential status refusal. No other requirement changes.
- `profiles/profile-bootstrap`: the "Account status is readable but not self-assigned" requirement gains the endpoint that finally exposes it (`GET /v1/me`) and the rule that status is never self-assigned except through the explicit deactivation and reactivation transitions.
- `trust/consent-and-audit-records`: the enumerated list of audited authentication events gains activation, suspension, deactivation, and a blocked sign-up.

## Impact

- **Code:** `packages/domain/src/identity.ts` (three methods and two error codes), `services/api/src/identity/` (status guard, activation on verification, suspension and deactivation, blocked-signup lookup), a new `services/api/src/me/` module for `GET /v1/me` and `POST /v1/me/deactivate`, `apps/web` route handlers for the deactivation call and the account page, `packages/contracts/openapi.yaml` (two new paths and the account schema).
- **Data:** no new table and no column change. One data migration backfills `status = 'ACTIVE'` where `email_verified = true`. `signup_blocks` gains a read path, which needs the existing `signup_blocks_email_hash` unique index only.
- **API:** `GET /v1/me` and `POST /v1/me/deactivate` become implemented. `POST /v1/auth/sign-in` gains `403 EMAIL_NOT_VERIFIED` and `403 ACCOUNT_SUSPENDED` and returns `account_status`.
- **Configuration:** none new; the block hash keeps using `BETTER_AUTH_SECRET`.
- **Dependencies:** none. better-auth 1.7.15 already provides every option used.
- **Docs:** `README.md` status line, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `docs/functional-requirements.md` (FR-AUTH-08 to 10), `docs/glossary.md`, `docs/auth-and-access-control.md` §13, `docs/api-contracts.md` §5.1 and §10, `docs/data-model.md` (status lifecycle note), `docs/decision-log.md` (activation trigger, deactivation reversal, and the rename).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Refusing unverified sign-in breaks an existing flow that depends on it | Only tests assert it. The BFF sign-in handler maps the new `403` to a "verify your email" message with a resend link; the integration test that asserts the old behavior is rewritten in the same commit. |
| The status guard becomes an account-existence oracle | Status is evaluated only after the password is accepted, and both refusals are `403` with a codes-only body. A test asserts a wrong password on a suspended account and on an unknown email returns the same `401` body. |
| A 12-month signup block punishes someone who has since turned 18 | The block is keyed on the email and checked before the age gate, because a changed date of birth is the exact evasion it exists to stop. The 12-month expiry is the existing Proposed default; the block reason is recorded and a support path is noted. Owner may shorten it. |
| Activation inside better-auth's `afterEmailVerification` hook runs outside the request transaction | The activation write is a single idempotent `UPDATE ... WHERE status = 'PENDING'` plus one audit insert, retried by the test that reopens a used link; a failure leaves the account `PENDING` with a verified email, which the next verification attempt repairs. |
| Deactivation reversal is a policy nobody has decided | Specified as a Proposed default with an owner confirmation listed in the handoff; if rejected, the alternative is an admin-only reinstatement and one extra endpoint. |

Rollback: revert the branch. The data migration is forward-only, but `status` only ever moves from `PENDING` to `ACTIVE` for accounts that were already verified, which is the state the previous code produced anyway.

**Traces to:** FR-AUTH-03 (blocked-signup policy), FR-AUTH-08, FR-AUTH-09, FR-AUTH-10, FR-ADM-05 (sanction workflow only, not implemented here), FR-PROF-01 seed behavior, SEC-AUTH-5 (session revocation), SEC-AUTH-6 (no account-existence disclosure), SEC-AUTH-7 (under-18 block), D-31 (session model), D-32 (migration workflow), D-33 (identity scope split), ADR-003 (`IdentityService` seam), ADR-018 (Drizzle).
