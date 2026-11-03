# Design

## Context

See `proposal.md` — Why. This section records only the state and constraints that shape the approach.

**Repository snapshot (verified 2026-11-03, re-check at apply):**

- `packages/domain/src/identity.ts` holds `AccountStatus` (six values, already complete) and the `IdentityService` interface with eight operations; `IdentityErrorCode` has six values and none of them describes an account state.
- `services/api/src/identity/better-auth-identity.service.ts` is the single implementation (373 lines). `signIn` maps `statusCode === 401` to `INVALID_CREDENTIALS`; `readSession` maps any client error to `null`; `users.status` is written only by the registration default.
- `services/api/src/identity/better-auth.ts` configures the library: `emailAndPassword.autoSignIn: false`, `requireEmailVerification` **not set**, `emailVerification.sendOnSignUp: true`, and no `databaseHooks` block at all.
- `services/api/src/identity/auth.controller.ts` exposes `/v1/auth/*` only. `GET /v1/me` does not exist and no `me` module exists. `bearerToken()` is a private helper inside that controller.
- `services/api/src/identity/audit-log.ts` declares `AuditAction` as a closed union of eight strings.
- `apps/web` has BFF route handlers under `app/api/auth/*` and pages for sign-up, sign-in, verify, reset; strings live in `apps/web/lib/strings.ts`.
- `signup_blocks` (`services/api/src/db/schema/trust.ts`) exists with a unique `email_hash` and an index on `expires_at`. Grep confirms **no read path**: the table is only ever inserted.
- `identity.integration.test.ts` asserts `user.status === "PENDING"` after registration (line 190) and asserts that an unverified account can sign in (line 334).

**Library facts verified on 2026-11-03** (source: context7 `/better-auth/better-auth/v1.7.15`):

| Fact | Value |
|---|---|
| `emailAndPassword.requireEmailVerification` | Blocks email/password sign-in until verified; needs `sendVerificationEmail` implemented **and** `sendOnSignIn: true`; does not gate social sign-in, which has its own per-provider option |
| Unverified sign-in response | `403`; the docs' client example branches on `ctx.error.status === 403` |
| Duplicate sign-up with the option on | Returns success instead of an error, to prevent enumeration — matches what this service already does by hand |
| `databaseHooks.<entity>.create.before` | Supported for `user`, `session`, `account`, `verification`; returning `false` aborts the write, and throwing `APIError` from `better-auth/api` aborts it with that error |
| Retry caveat | A before-hook can run more than once per operation **on MongoDB** transaction retries; not documented for Postgres |
| `auth.api.revokeSessions` | Revokes sessions scoped to the caller's own session; there is no documented server API for revoking another user's sessions outside the admin plugin |
| Admin plugin | Exists (`adminUserIds`, ban model); not adopted — see D4 |

## Goals / Non-Goals

**Goals**

- One invariant, enforced in one place: **a session row exists only for an `ACTIVE` account**. Suspension and deactivation destroy sessions; creation refuses to make one otherwise.
- A status refusal that never becomes an account-existence oracle.
- The blocked-signup policy finally reading the table it already writes.
- An owner-visible account status, so the state this change introduces is observable without a database console.

**Non-Goals**

- The admin console, sanction UI, reason templates, and user notification (FR-ADM-05, Sprint 7). Only the account-level mechanics ship here, proven by tests and a seam method.
- Account deletion, `DELETION_PENDING`, `ANONYMIZED`, and erasure semantics.
- Any change to the `account_status` enum — six values stay six values.
- Profile fields on `GET /v1/me` (change #4 extends the endpoint).

## Decisions

### D1 — Activation happens on email verification, inside the session invariant

`PENDING` means "registered, not yet verified". Opening the verification link writes `ACTIVE`. The alternative triggers were rejected on grounds that already exist in the docs: activating at registration makes `PENDING` unreachable and defeats FR-AUTH-01's permission boundary; activating on first profile couples the lifecycle to change #4 and would leave the account unusable for the Google sign-in path in Sprint 2, which is not gated by email verification and therefore needs an explicit activation.

Implementation is a single idempotent statement — `UPDATE users SET status = 'ACTIVE' WHERE id = $1 AND status = 'PENDING'` — plus one audit insert, invoked from the library's `afterEmailVerification` hook and exposed as `activateAccount` on the seam for the provider path later. `WHERE status = 'PENDING'` is what makes "activation never reverses another state" true rather than merely intended: a suspended account cannot be revived by replaying a verification link.

### D2 — The library enforces the pending case; a session-creation hook enforces the rest

`emailAndPassword.requireEmailVerification: true` plus `emailVerification.sendOnSignIn: true` refuses an unverified account with `403` before any session exists. That is the whole pending rule, and the service maps the `403` to `EMAIL_NOT_VERIFIED`.

Suspension cannot use that option, because the library knows nothing about `users.status`. The rejected approaches were: deleting the session row after a successful `signInEmail` (works, but leaves a window in which a suspended account holds a session, and adds a cleanup path that can silently fail), and checking status before `signInEmail` (turns sign-in into an existence oracle and would need a second password check). Instead the library's `databaseHooks.session.create.before` reads the account status and:

- `ACTIVE` → allow
- `DEACTIVATED` → reactivate (D5), then allow
- `PENDING` → refuse with `EMAIL_NOT_VERIFIED` (belt and braces; the library gate normally gets there first)
- `SUSPENDED`, `DELETION_PENDING`, `ANONYMIZED` → refuse with `ACCOUNT_SUSPENDED` or `FORBIDDEN`

Refusal throws `APIError` from `better-auth/api`. The exact error shape that `signInEmail` surfaces back to the caller is asserted by the integration test at apply rather than assumed here; the mapping helper accepts either a `statusCode` or a machine-readable code and is covered for both.

Because sessions are destroyed on suspension and refused at creation otherwise, `getSession` needs no status check of its own: the existence of the row is the proof of an active account. This is the design's main simplifying bet, and the test that suspends a user mid-session is what pins it.

### D3 — Credentials are always checked before status

The refusal must not become an enumeration oracle (SEC-AUTH-6). Both gates run inside the library's sign-in path, which validates the password first: the verification gate is evaluated after a successful password check, and the session hook only runs once the library has decided to create a session. A wrong password therefore surfaces as the existing `401 INVALID_CREDENTIALS` on every status. The integration test asserts that a suspended account with a wrong password and an unknown email return byte-identical bodies.

### D4 — Suspension revokes sessions with a direct `DELETE`; no admin plugin

Suspension and deactivation delete the account's `sessions` rows with Drizzle, in the same transaction as the status write. The sessions table is ours, the spec already names Postgres rows as the source of truth, and there is no library API for revoking another user's sessions.

Rejected: better-auth's `admin` plugin, which brings its own `banned`/`role` user fields and a second authorization model alongside `account_status` and the project's own roles. Two overlapping authority systems in a trust-critical area is worse than one `DELETE`.

Atomicity is the spec's requirement, so the status update, session delete, and audit insert share one transaction; a failure rolls back all three.

### D5 — Deactivation is reversible by signing in (owner-confirmed 2026-11-03, D-36)

The docs describe deactivation as the user pausing their account but never say how the pause ends. Options were: admin-only reinstatement (adds an endpoint and a support dependency in the pilot), a credential-bearing reactivation endpoint (a new unauthenticated write path), or reactivation on a successful password sign-in (no new endpoint, no new token, one idempotent update already in the session hook). The third is chosen and **owner-confirmed** because it is the only one that costs no new surface, and "pause" stays honest.

Consequence recorded: `DEACTIVATED` never produces a `403`. If the owner rejects this, the change grows one endpoint (`POST /v1/me/reactivate` with a signed reactivation token) and the `ACCOUNT_DEACTIVATED` error code returns to the catalog.

### D6 — Seam shape

```ts
export interface ActivateAccountInput  { userId: string; requestId: string }
export interface SuspendAccountInput   { userId: string; reason: string; actorUserId: string; requestId: string }
export interface DeactivateAccountInput { sessionToken: string; requestId: string }

activateAccount(input: ActivateAccountInput): Promise<AccountSummary>
suspendAccount(input: SuspendAccountInput): Promise<AccountSummary>
deactivateAccount(input: DeactivateAccountInput): Promise<void>
```

`deactivateAccount` takes a session token because it is self-service and the account id must not be trusted from the request body (object-level authorization, AGENTS.md rule 7). `suspendAccount` takes an explicit `actorUserId` so the audit entry can name the sanctioning actor rather than the subject. `activateAccount` takes a user id because its callers (the verification hook, later the provider path) already know it. `reason` stays a free string with no PII; FR-ADM-05 owns its vocabulary.

Both `EMAIL_NOT_VERIFIED` and `ACCOUNT_SUSPENDED` are added to `IdentityErrorCode` and mapped to `403`. `EMAIL_NOT_VERIFIED` already exists in the error catalog in `docs/api-contracts.md` §10, so reusing its name keeps the API and the docs from drifting. `SESSION_INVALID` is not reused: "your account is suspended" and "you are signed out" need different copy and different client behaviour.

### D7 — `GET /v1/me` ships in this change, not in change #4

`profiles/profile-bootstrap` already requires status to be exposed and the requirement has been unmet since the previous archive. Deferring it again would leave a second unmet claim in the same spec, and the lifecycle needs an observable read to be testable end to end. The endpoint returns the account summary only — id, display name, email, `email_verified`, `account_status`, timezone — which is exactly the boundary that spec draws ("no endpoint SHALL expose profile fields beyond the account record itself"). Change #4 extends this response with profile data instead of adding a competing endpoint.

A new `services/api/src/me/` module holds `GET /v1/me` and `POST /v1/me/deactivate`. The private `bearerToken()` helper moves to `services/api/src/http/bearer.ts` so both controllers share it; that is the whole refactor.

### D8 — Blocked sign-up is a hash lookup before the age gate

Registration computes the same HMAC-SHA-256 of the lowercased email that `recordUnderageAttempt` writes, and looks for a row whose `expires_at` is in the future. If one exists, registration refuses with `422 UNDER_MINIMUM_AGE` and writes nothing — no user, no consent, no audit entry naming an address (matching the failed-sign-in rule).

The check must run **before** the age gate, because the block exists precisely to stop a resubmission with a changed date of birth; running it after would make it unreachable. The cost is that a person who has since turned 18 is refused until the entry expires; the 12-month default is the value already Proposed in `docs/data-model.md`, recorded as a risk, and listed for owner confirmation.

`expires_at` is compared with `now` from the existing injected clock, not `now()` in SQL, so the boundary is testable.

### D9 — The backfill is a separate data migration

`UPDATE users SET status = 'ACTIVE' WHERE status = 'PENDING' AND email_verified = true`. Without it, every already-verified local account becomes unable to sign in the moment D2 lands. It is forward-only and idempotent. Per D-32 the schema change is generated by `drizzle-kit` while hand-written SQL inside the migration chain carries the backfill; the exact custom-migration invocation is confirmed at apply rather than assumed here.

### D10 — Web surfaces one new page and three new messages

`apps/web` gains an account route that reads `GET /v1/me` through a BFF handler, shows the status, and offers deactivation behind a confirmation; the deactivation call goes through a BFF route handler so the cookie stays out of client JavaScript. The sign-in page maps `403 EMAIL_NOT_VERIFIED` to a "check your email" message with a resend action, and `403 ACCOUNT_SUSPENDED` to a "this account is suspended" message. All strings go in `apps/web/lib/strings.ts` per AGENTS.md rule 9.

## Risks / Trade-offs

- **Hook error mapping is the least certain part** → the docs show `APIError` aborting a write but not what `signInEmail` rethrows; the integration test asserts the observed shape, and `isStatusRefused()` accepts a `statusCode` or a code so a 1.7.x change in error detail does not break the mapping.
- **Before-hook retries** → documented for MongoDB only; the reactivation update is `WHERE status = 'DEACTIVATED'` and therefore idempotent if it ever runs twice.
- **The block check discloses that an address attempted sign-up** → the response is the same `UNDER_MINIMUM_AGE` the original attempt received, and the block reveals nothing about account existence. Accepted for the pilot.
- **A 12-month block outlives the age problem** → recorded; the owner may shorten the expiry, which is a constant, not a schema change.
- **Deactivation reversal is an undecided policy** → shipped as a Proposed default with an explicit confirmation item in the handoff.
- **Two enforcement points for one rule** (library gate for pending, hook for the rest) → accepted deliberately: the library gate is the only way to refuse before a session exists for unverified accounts, and the hook is the only way to refuse suspension at all. Both are covered by the same invariant test set.

## Migration Plan

1. Add the two `IdentityErrorCode` values and the three seam methods; typecheck both packages.
2. Turn on `requireEmailVerification` and `sendOnSignIn`; add the `databaseHooks.session.create.before` guard.
3. Write the backfill migration; apply it to the local Compose database and confirm no `PENDING` account with `email_verified = true` remains.
4. Add the `me` module and move `bearerToken()`; add the two OpenAPI paths.
5. Update the three tests that encode the old behavior, then run the four gates.
6. Rollback: revert the branch. The backfill is not reversed, and it does not need to be — it writes the state the previous code already assumed.

## Open Questions

All three were answered by the owner before apply (2026-11-03) and are recorded as D-36 and D-37.

- **Deactivation is reversible by signing in (D5).** Confirmed: yes. No reactivation endpoint and no `ACCOUNT_DEACTIVATED` code ship.
- **Signup block duration.** Confirmed: stays at 12 months as one named constant.
- **Do `DELETION_PENDING` and `ANONYMIZED` need a distinct refusal code?** Still deferred to the deletion/privacy change, which is their first writer. Until then they refuse with the documented `FORBIDDEN` (`403`).
