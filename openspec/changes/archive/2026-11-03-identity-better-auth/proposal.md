# Proposal

## Why

Sprint 1 starts with identity: no account, session, or verified-email capability exists today, so profiles, requests, outcomes, and reputation have nothing to attach to. The repository also still lacks the database foundation that Sprint 0 deferred (no Drizzle schema, no migration, no connection module), and every later capability needs it.

This change also resolves a documented contradiction. `docs/mvp-build-plan.md` §5 describes change #2 as "IdentityService, Google and email/password, verification, forgot-password, sessions, MFA", while `docs/milestones-and-phases.md` §5.2 places Google sign-in, MFA, and session management in Sprint 2. The scope below is the single reference from now on, and both documents are corrected in this change.

## What Changes

- Add the `IdentityService` interface in `packages/domain` (pure types, no library imports) and a `BetterAuthIdentityService` implementation in `services/api` (ADR-003).
- Add the database foundation deferred from Sprint 0: Drizzle ORM schema, `drizzle-kit` configuration, the baseline migration (auth tables plus `institutions`, `institution_domains`, `consent_records`, `audit_logs`, `signup_blocks`), and a database module with a pooled `pg` connection. Schema files live in TypeScript; migrations are forward-only SQL under `services/api/drizzle/` (ADR-018).
- Add email/password registration, email verification, sign-in, sign-out, forgot-password, and reset-password through `POST /v1/auth/*`, implemented with better-auth behind `IdentityService`.
- Add a Postgres-backed session store: server-side session rows are the source of truth for revocation, with httpOnly cookie handling in the Next.js BFF (owner decision D-27). Access to the API from the browser goes through `apps/web` route handlers only.
- Add the 18+ gate at registration: the date of birth is checked in-request and never persisted; `users.age_18_plus`, `users.age_gate_passed_at`, and `users.age_gate_version` are written on success; an under-18 attempt returns `422 UNDER_MINIMUM_AGE` and writes only a keyed email hash to `signup_blocks` (FR-AUTH-03, SEC-AUTH-7).
- Add a password policy of minimum 12 characters, no composition rules, no scheduled rotation, and no password or hash in logs (D-04, SEC-AUTH-3).
- Add basic consent capture at registration: append-only `consent_records` for `TERMS` and `PRIVACY_NOTICE` with a document version (FR-CONS-01, basic).
- Add basic audit writes for authentication events: registration, verification, sign-in success and failure, reset request and completion, sign-out-everywhere (FR-AUD-01, basic).
- Seed reference data idempotently: `institutions` and `institution_domains` rows from a checked-in seed file (FR-VER-01 seed only; no affiliation claim flow in this change).
- Create the account record at registration: one `users` row with display name, timezone default `Asia/Dhaka`, and `account_status = PENDING` (FR-PROF-01/02 seed only; student and mentor profile tables and endpoints are deferred).
- Add the required environment variables to `.env.example` (names only): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the existing `SMTP_*` set.
- Correct the planning docs: `docs/mvp-build-plan.md` §5 gains a status column and the narrowed change #2 description; `docs/milestones-and-phases.md` gains the mandated "Current state" block.
- Add dependencies with exact versions: `better-auth` 1.7.15, `@better-auth/drizzle-adapter` 1.7.15, `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `nodemailer` 10.3.1, `@types/nodemailer` (matching major).

**Deferred to the Sprint 2 change `access-google-mfa-and-sessions` (not in this change):**

- Google sign-in (`FR-AUTH-02`), including provider account linking.
- MFA / TOTP enforcement for Mentors, Institution Admins, and Platform Admins (`FR-AUTH-04`). better-auth's `twoFactor` plugin is the intended path (see `design.md`).
- Session list, per-session revoke, and the security-settings UI (the remainder of `FR-AUTH-05`).
- Role-based and object-level authorization beyond the authentication guard (`FR-AUTH-07`).
- Full mentor/student profile CRUD and the dynamic `fields` table (`FR-PROF-01`, `FR-PROF-02` full behavior).
- The affiliation claim flow and Level 1 automatic grant (`FR-VER-01` full behavior).

**BREAKING:** none. No product capability, schema, or migration exists in the repository yet.

## Capabilities

### New Capabilities

- `identity/email-password-auth`: account registration, email verification, sign-in and sign-out, password reset, the Postgres session store, and the `IdentityService` seam that all identity operations pass through.
- `profiles/profile-bootstrap`: the minimal account record created at registration (display name, timezone, `account_status`) that later profile capabilities extend; no student or mentor profile exists yet.
- `institutions/affiliation-seed`: the seeded `institutions` and `institution_domains` reference data that the deferred affiliation claim flow will read.
- `trust/consent-and-audit-records`: the append-only consent records written at registration and the audit entries written for authentication events.

### Modified Capabilities

None. No existing spec's requirements change; this change only adds capabilities.

## Impact

- **Code:** `services/api` (identity module, database module, Drizzle schema and migrations, email sender), `apps/web` (BFF route handlers and the sign-up / sign-in / verify / reset pages), `packages/domain` (`IdentityService` interface and pure age-gate and password-policy functions), `packages/contracts` (OpenAPI auth paths), `packages/config` (session and age-gate constants).
- **Data:** new tables in the first migration — `users`, `sessions`, `accounts`, `verifications` (better-auth schema), `institutions`, `institution_domains`, `consent_records`, `audit_logs`, `signup_blocks`.
- **Configuration:** `.env.example` gains `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; `compose.yaml` and `compose.dev.yaml` pass them through. No secret value is committed.
- **Dependencies:** `better-auth`, `@better-auth/drizzle-adapter`, `drizzle-orm`, `drizzle-kit`, `nodemailer`, `@types/nodemailer` at exact versions, with `pnpm-lock.yaml` committed.
- **Docs:** `README.md` status line, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` (current state), `docs/data-model.md` (auth tables and enums), `docs/api-contracts.md` and `packages/contracts/openapi.yaml` (auth paths), `docs/local-setup.md` (migration command and new env names), `docs/decision-log.md` (new rows for the scope split and the migration ownership).
- **Out of scope:** everything listed under Deferred above, plus outbox/pg-boss job delivery (email is sent directly through a small `EmailSender` seam so pg-boss can wrap it later), MFA, and any admin tooling.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| better-auth's generated schema drifts from the documented shape | The schema is written by hand from the shape documented in `design.md` (dated snapshot) and verified by a migration + integration test against the real Postgres container; the library's schema-generation CLI is not used. |
| The BFF cookie transport is the largest new surface | Keep it to four route handlers with no token in `localStorage`; test with the existing `node:test` discipline; the API still accepts Bearer for non-browser clients. |
| A new migration in the first schema could be wrong on first run | Forward-only migration, run manually against the local container, verified by `pnpm test` and a clean `docker compose up`; rollback is dropping the local volume, since no real data exists. |
| Email delivery blocks the verification demo | Mailpit is already in the local stack; the sender is an interface so a provider can replace it without touching the flow. |

Rollback: revert the change branch; drop the local Postgres volume to remove the new tables. Nothing is deployed and no real user data exists.

**Traces to:** FR-AUTH-01, FR-AUTH-03, FR-AUTH-05 (password reset and sign-out-everywhere only), FR-PROF-01 seed, FR-PROF-02 seed, FR-VER-01 seed, FR-CONS-01 basic, FR-AUD-01 basic, SEC-AUTH-3, SEC-AUTH-4, SEC-AUTH-5, SEC-AUTH-6, SEC-AUTH-7, ADR-003, ADR-018, ADR-006, D-04, D-11, D-12, D-23, D-27, D-29.
