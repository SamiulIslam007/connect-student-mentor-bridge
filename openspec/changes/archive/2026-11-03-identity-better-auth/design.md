# Design

## Context

See `proposal.md` — Why. This section records only the state and constraints that shape the approach.

**Repository snapshot (verified 2026-11-03, re-check at apply):**

- pnpm workspace, `pnpm@12.16.1`, Node `>=24.19.0 <25`, TypeScript 6.0.3, ESLint 10.13.0.
- `services/api` is a NestJS 12.3.2 app with `health` only (`src/main.ts`, `src/app.module.ts`, `src/health/`); `src/worker.ts` is a keep-alive stub. Its dependencies are `@connect/*`, `@nestjs/*`, `pg` 8.23.1, `reflect-metadata`, `rxjs`.
- `apps/web` is a Next.js App Router shell: `app/layout.tsx`, `app/page.tsx`, `app/healthz/route.ts`, one test.
- No Drizzle schema, no `drizzle.config.*`, no migration, no database module, no `drizzle-orm`, `drizzle-kit`, `better-auth`, `nodemailer`, or `pg-boss` anywhere. Sprint 0 explicitly deferred them in its archived proposal.
- `compose.yaml` / `compose.dev.yaml` already run `postgres` (host port 55432, container 5432), `versitygw`, `mailpit` (SMTP 1025), and `clamav`.
- `.env.example` already defines `DATABASE_URL`, `SMTP_*`, `MAILPIT_*`, `API_PORT`, `WEB_PORT`. It does not define any auth variable.
- ESLint boundaries: `packages/domain` stays pure (no react/next/@nestjs/express/pg); `apps/web` must not import `services/api`; `services/api` must not import `apps/web`.

**Library facts verified on 2026-11-03** (source: context7 `/better-auth/better-auth`; versions from the npm registry):

| Fact | Value |
|---|---|
| `better-auth` latest | 1.7.15 |
| Drizzle adapter | Extracted to its own package since v1.5; `@better-auth/drizzle-adapter` 1.7.15; `better-auth/adapters/drizzle` also re-exports it |
| Adapter call | `drizzleAdapter(db, { provider: "pg", usePlural: true, transaction: true })` |
| Peer versions | `drizzle-orm` `^0.45.2`, `drizzle-kit` `>=0.31.4`, `pg` `^8.0.0` (latest: drizzle-orm 0.45.4, drizzle-kit 0.31.11) |
| Server options | `secret` or `BETTER_AUTH_SECRET` (min 32 chars, high entropy); `baseURL` or `BETTER_AUTH_URL`; request inference is explicitly discouraged |
| Verification | `emailVerification.sendVerificationEmail({ user, url, token }, request)`, `sendOnSignUp`, `sendOnSignIn`, `expiresIn` (default 3600s) |
| Verification token storage | **Stateless JWT (HS256) over the lowercased email; never persisted, so there is no database-level single-use record** |
| `requireEmailVerification` | Blocks sign-in for email/password accounts and requires `sendOnSignIn: true`; returns success for an existing email to prevent enumeration |
| Reset | `emailAndPassword.sendResetPassword({ user, url, token }, request)`; token stored in `verifications`, single-use consume, `resetPasswordTokenExpiresIn` (default 3600s); `revokeSessionsOnPasswordReset: true` revokes all sessions; atomic only when the adapter is passed `transaction: true` |
| Session options | `expiresIn` (default 604800s), `updateAge` (default 86400s), `modelName`, `fields`, `additionalFields`, `storeSessionInDatabase`, `cookieCache` |
| Custom columns | `user.additionalFields` with `type`, `required`, `defaultValue`, `input`, `returned` (`input: false` for server-owned fields) |
| Plural tables | `usePlural: true` when every auth table is plural |
| MFA (Sprint 2) | `twoFactor()` from `better-auth/plugins`; `POST /two-factor/enable` returns `totpURI` and backup codes; client uses `twoFactorClient` from `better-auth/client/plugins` |
| Schema generation | `npx auth generate --adapter drizzle --dialect postgresql` exists in 1.7 — **not used**, see D2 |

## Goals / Non-Goals

**Goals**

- One identity seam (`IdentityService`) that every feature consumes, with no vendor type escaping it.
- A database foundation (schema, migration, connection module) that unblocks every later sprint.
- A working Sprint 1 demo: sign up, verify by email, pass the age gate, hold a Postgres-backed session, reset a password, sign out everywhere.
- Trust artifacts from day one: consent rows and audit rows written and protected against update/delete.

**Non-Goals**

- Google sign-in, MFA, per-session list/revoke, and role authorization (Sprint 2 change `access-google-mfa-and-sessions`).
- Student/mentor profile tables, the dynamic `fields` table, and affiliation claims (later capabilities).
- Job queue (pg-boss/outbox), retry, or email provider failover.
- Rate limiting, account lockout, and abuse controls (Sprint 7 per `milestones-and-phases.md` §5.2).

## Decisions

### D1 — Identity seam in `packages/domain`, implementation in `services/api`

`packages/domain` holds the `IdentityService` interface and its input/output types plus the pure age-gate and password-policy functions. `services/api/src/identity/` holds `BetterAuthIdentityService`, which is the only file that imports `better-auth`.

Alternatives rejected: putting the interface next to the implementation (feature code would import `services/api`, which the ESLint boundaries forbid); returning library objects (leaks vendor types into domain code).

### D2 — Hand-write the auth schema; do not run the library's schema CLI

The Drizzle schema is written by hand from the table shape documented above and committed. `npx auth generate` is not used: `AGENTS.local.md` forbids running third-party installers or `npx <package>`, and generated output would be an unreviewed source of truth.

Alternatives rejected: running the CLI once and committing its output (faster, but unreviewable and outside the repo's dependency rules).

### D3 — Database foundation ships in this change

The change adds `drizzle-orm`, `drizzle-kit`, `services/api/src/db/` (pooled `pg` connection + schema), `drizzle.config.ts`, and the baseline migration. This is the Sprint 0 deferral; without it the session store has nowhere to live.

Alternative rejected: build the DB layer as a separate change first — it would delay Sprint 1 by a full propose/apply cycle for no review benefit, since this change is where the first real schema is decided anyway.

### D4 — Auth tables are library-native and plural; the mentorship session table is renamed

Auth tables are `users`, `sessions`, `accounts`, `verifications` (`usePlural: true`). `docs/data-model.md` already names a mentorship table `sessions`, which would collide, so that table is renamed `mentorship_sessions` in the docs (no code or data exists yet).

Project columns on `users` are added through `additionalFields`: `timezone`, `status`, `age_18_plus`, `age_gate_passed_at`, `age_gate_version`, `last_seen_at`, `anonymized_at` — all server-owned (`input: false`), so no client can set them. The library's `name` column is the display name; the domain type exposes it as `displayName`.

Docs corrections carried by this change: `users.email_verified_at` becomes the library's `email_verified` boolean (the verification time lives in the audit entry), and `users.identity_subject` is dropped because `users.id` is already the opaque library subject returned by the seam.

Alternatives rejected: keeping `email_verified_at` alongside the boolean (two sources of truth for one fact); renaming the auth tables instead (more mapping code in the adapter for no gain).

### D5 — Session policy

`session.expiresIn` = 30 days, `updateAge` = 1 day, `cookieCache` left disabled so a revoked session fails immediately (the spec's "revoked session rejected" scenario). Admin idle timeouts of 30 minutes/8 hours from `auth-and-access-control.md` §5 arrive with MFA in Sprint 2, because they only apply to privileged roles.

Trade-off recorded: `auth-and-access-control.md` §5 describes a 15-minute access token plus rotating refresh token. better-auth's cookie session is not that shape, and the BFF holds the cookie while the API validates the session per request. The refresh-token-reuse rule (SEC-AUTH-5) therefore maps to session-row revocation on rotation failure rather than to a separate refresh token family. This deviation is recorded in the docs task.

### D6 — Email through a small `EmailSender` seam, no job queue yet

`EmailSender` (interface) + `SmtpEmailSender` using `nodemailer` 10.3.1 against Mailpit locally. better-auth's `sendVerificationEmail` and `sendResetPassword` callbacks invoke it without awaiting the send, matching the library's timing-attack guidance, and failures are logged with a structured event.

Alternatives rejected: adding pg-boss and the outbox now — it is a real deferral from Sprint 0, but it doubles this change for retry semantics the pilot does not need yet. Upgrade path: implement `EmailSender` on top of the outbox writer, and the callbacks do not change.

### D7 — Age gate as a pure function, enforced before account creation

`packages/domain` gets `isAtLeast18(dateOfBirth, now)` and the wording-version constant. `apps/web` collects the date of birth and posts it once; the API evaluates it before creating the user, writes `age_18_plus`/`age_gate_passed_at`/`age_gate_version`, and never persists or logs the date.

Under-18 attempts write a keyed hash (`HMAC-SHA-256`, key from `BETTER_AUTH_SECRET`) to `signup_blocks` with a 12-month expiry (Proposed default in `data-model.md`).

Alternatives rejected: a separate `SIGNUP_HASH_SECRET` (better key separation, one more required env var for a single-use value — revisit if the secret is ever rotated independently); storing the date of birth (forbidden by FR-AUTH-03).

### D8 — Consent and audit writes are transactional where they must be

Consent rows are written in the same transaction as the user row, so an account can never exist without its two consent records. Audit entries are appended after the authentication outcome is known, so a failed attempt still produces a row.

Append-only is enforced in the database: the migration revokes `UPDATE` and `DELETE` on `consent_records` and `audit_logs` from the application role (the ledger-grant pattern Sprint 0 planned).

Alternatives rejected: application-level discipline only (one careless query breaks the guarantee).

### D9 — Migration ownership and workflow

`drizzle-kit generate` produces a committed SQL migration; `drizzle-kit migrate` (or the documented equivalent) applies it. Migrations are forward-only. The `postgresql` MCP stays read-only and never applies DDL — Samiul or an approved script applies migrations.

### D10 — Test seams instead of mocking libraries

Unit tests (`node:test` + `node:assert/strict`, sibling `test/` folders) cover the age gate, password policy, and domain mapping with an injected clock. Integration tests run against the Compose Postgres using a dedicated test database and assert: migration applies, registration writes user + consent + audit rows, a revoked session is rejected, reset revokes sessions. Email is asserted through a fake `EmailSender` that records calls.

### D11 — Transport stays BFF-only

`apps/web` gets four route handlers (`/api/auth/register`, `/verify`, `/sign-in`, `/reset`) that call the API with a short-lived bearer token and set the httpOnly cookie. No token reaches client JavaScript. CSRF uses the standard Next.js same-origin form handling plus SameSite=Lax during the pilot; a dedicated token is a Sprint 7 hardening item if the review requires it.

## Risks / Trade-offs

- **Verification link replay** (stateless JWT, no DB consume record) → the link only sets `email_verified` for its own email, so replay is idempotent; `expiresIn` is set to 24 hours per `auth-and-access-control.md` §4.4.
- **No email retry** → a failed send is logged with the user id and template key and the user can request a new link; pg-boss replaces this in a later change.
- **No rate limiting yet** → sign-in and reset are unthrottled in Sprint 1; the risk is accepted for local-only use and Sprint 7 owns the limits (SEC-ABUSE).
- **Adapter schema drift across 1.7.x** → exact version pin, migration reviewed by hand, and the schema shape is re-checked with context7 before apply.
- **BFF is the largest new surface** → four handlers, no token in storage, integration test on the cookie path; the API keeps accepting Bearer for non-browser clients.
- **`transaction: true` behaviour depends on the adapter** → the reset flow's atomicity is asserted by a test that forces a failing password update and expects the token to remain usable (documented library behaviour).

## Migration Plan

1. Add dependencies at exact versions and commit `pnpm-lock.yaml`; run `pnpm audit --audit-level high`.
2. Write the schema and generate the baseline migration; review the SQL before applying.
3. Apply to the local Compose database, run the integration tests, then verify from a clean `docker compose up` on a fresh volume.
4. Rollback: revert the branch and drop the local Postgres volume — no deployed environment or real data exists.

## Open Questions

- Which transactional email provider serves deployed environments (Mailpit is local only)? Deferred; the `EmailSender` seam isolates it.
- Does the pilot need CSRF tokens in addition to SameSite=Lax? Decide with the Sprint 7 security pass.

## Assumptions

- The `(seed)` qualifier in the Sprint 1 scope means reference data and the minimal account record only; full profile CRUD and the affiliation claim flow stay out, matching `milestones-and-phases.md` §5.2's "seed only" wording.
- `FR-AUTH-05`'s "view active sessions" half belongs to the deferred Sprint 2 work, while password reset and sign-out-everywhere ship here.
- Postgres 16 (`postgres:16-alpine` in `compose.yaml`) supports `citext`, `pgcrypto`, and column-level grants used by the migration.
