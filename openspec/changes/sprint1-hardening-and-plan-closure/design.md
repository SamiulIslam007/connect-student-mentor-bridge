# Design

## Context

See `proposal.md` - Why. The repo is at `0ec23c8` on `feat/sprint1-hardening-and-plan-closure`; the propose-time document conformance commit is `20ef00d`. Schema/migration and code facts below are a **2026-11-03 snapshot**; re-verify them at apply time.

- The migrations are `0000_baseline.sql`, `0001_backfill_active_verified.sql`, and `0002_colossal_spot.sql`. `0000` grants `connect_app` DML on the seven original tables and SELECT/INSERT on `consent_records` and `audit_logs`. `0002` adds the five profile tables and **no grants**. `SET ROLE connect_app; SELECT count(*) FROM fields` returns `permission denied for table fields`.
- `connect_app` is `NOLOGIN`; local development connects as the `POSTGRES_USER` owner. The role's purpose is the API/worker outside local development (`0000_baseline.sql:136-149`).
- `.github/workflows/ci.yml` has no database service. `test/support/database.ts` returns a skip when `DATABASE_URL` is missing or `connect_test` is unreachable; the CI log shows 56 API tests, 9 pass, 47 skipped.
- `auth.controller.ts` validates email with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, which accepts `a@b..c`. The identity library then throws an internal validation error that the Nest filter maps to `500`.
- `signIn` does not call `runWithRequestId`; the session hook's activation audit uses `currentRequestId()`, which falls back to `unattributed`. It also re-reads the account only for `DEACTIVATED`, so a verified-`PENDING` repair returns a stale `pending` status.
- `audit_logs.actor_user_id` is `text ... references(users.id, { onDelete: "set null" })`. Deleting a referenced user rewrites the audit row's actor to null, bypassing the `connect_app` UPDATE grant.
- The verify BFF route builds `Location` from `Host` and `x-forwarded-proto`; `readSessionCookie` calls `decodeURIComponent` without a catch. The BFF reads `request.json()` without a size guard. `GET /v1/fields` is unpaginated and accepts zero-width-only names.
- The web pages use the string catalog but no design system. Stitch was used at propose time for the two UI screens (see Decision D10).

## Goals / Non-Goals

**Goals:**

- Make the application role able to use every table the application owns, without granting UPDATE/DELETE on the append-only tables.
- Make the required CI gate actually execute the auth/profile database tests.
- Remove the confirmed 500s, open redirect, cookie crash, timing oracle, unbounded taxonomy input, and audit-history rewrite.
- Give the forgotten-password and under-18 paths a clear, usable UI without introducing a design system the rest of the app does not use.
- Keep the change reviewable: two forward-only migrations, one CI job edit, focused code paths, and tests for each behavior.

**Non-Goals:**

- `SEC-API-1` strict unknown-field rejection, rate limiting, and CSRF tokens (Sprint 7).
- Google/MFA/sessions (4a), availability/access mode (4b), affiliation (#5), outbox/pg-boss (6a).
- Field merge/rename or cross-script confusable folding (Phase 1b).
- A new design system for the existing pages; the Stitch output is a reference for the two new/changed screens only.
- A production deployment, a real login role in CI, or a reverse-proxy test.

## Decisions

### D1 - Grants are an additive forward-only migration

Add `0003_grant_profile_tables.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "fields", "student_profiles", "student_field_interests",
             "mentor_profiles", "mentor_fields"
  TO connect_app;
```

Exactly those five tables and exactly those four privileges. `connect_app` is `NOLOGIN`; a deployment creates a login role, grants `connect_app` to it, and uses that role's DSN. `docs/local-setup.md` documents the step and warns against the owner role outside local development. The test creates a user and a field as the owner, then runs `SET ROLE connect_app` and exercises SELECT/INSERT/UPDATE/DELETE on each table in a transaction that rolls back.

**Alternative rejected:** grant on all tables with `GRANT ... ON ALL TABLES IN SCHEMA public`. It would silently widen the append-only tables and any future table. A future table must add its own grant; the test names the five tables so an omission is visible.

### D2 - CI uses one Postgres service in the required `checks` job

Add a `postgres:16-alpine` service with a `pg_isready` health check, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB=connect`, and a step that creates `connect_test` before `pnpm test`. Set `DATABASE_URL=postgresql://connect:connect@localhost:5432/connect` for the test step. The test support derives `connect_test` from the path as it does today. When `process.env.CI` is truthy, `openTestDatabase` throws on a missing or unreachable database; outside CI it keeps the loud skip. The job names stay `checks`, `images`, `security`.

**Alternative rejected:** a separate `integration` job. The ruleset requires the three existing names; a fourth job would not gate the merge unless the ruleset changes. Adding the service to `checks` is the smallest change that makes the required gate real.

### D3 - Email validation and library 4xx mapping

Add one shared validator (in the API, used by all three auth request readers) that rejects empty labels, consecutive dots, a leading/trailing dot, and whitespace, then still calls the library. Additionally, wrap `signUpEmail`, `signInEmail`, and `requestPasswordReset` in a helper that translates a library client error into `IdentityError("VALIDATION_ERROR", "email must be a valid email address")`:

- `isAPIError(error)` with `statusCode` in 400–499 → map.
- The library's validation error with `body.code === "VALIDATION_ERROR"` → map.

The helper never maps a 5xx; a real fault stays a 500. Tests cover `a@b..c` on register, forgot-password, and sign-in.

**Alternative rejected:** adding Zod as a direct dependency only for the email schema. The library already validates; the API only needs a shape check and a mapping, so no new dependency is justified.

### D4 - Registration timing is equalized with the library's own hash

On the existing-address path, call `hashPassword(input.password)` from `better-auth/crypto` and discard the result before returning `verification_sent`. The new-address path already performs the library's hash inside `signUpEmail`; the verification email is sent in the background and is not awaited, so no SMTP wait is added. The acceptance check is 20 samples per path through the BFF, median ratio below 1.5×, recorded in the apply handoff.

Context7 facts (2026-11-03): `hashPassword` is exported from `better-auth/crypto` and re-exported from `@better-auth/utils/password`; `auth.$context.password.hash` exposes the same function. The throwaway call uses the public `hashPassword` export.

**Alternative rejected:** a fixed `setTimeout` delay. It does not match the hash cost and would drift with hardware. **Alternative rejected:** removing the pre-check and relying on the library duplicate path. That still sends a duplicate sign-up through a different code path, and the current pre-check avoids creating a second consent/audit attempt; the dummy hash keeps the observable behavior and equalizes the cost.

### D5 - Sign-in request context, post-transition read, and fail-closed audit

- Wrap `signInEmail` in `runWithRequestId(input.requestId, ...)`.
- After a successful call, always re-read the account with `requireAccount(result.user.id)`; do not branch only on `DEACTIVATED`.
- If the `SIGN_IN_SUCCEEDED` audit insert fails, call `auth.api.signOut({ headers: bearerHeaders(sessionToken) })` (best effort), log a revocation failure with the request id, then rethrow the audit error. The response is the existing generic 500.
- Add an optional `auditWriter` test seam to `BetterAuthIdentityServiceOptions`; the fault-injection test supplies a writer that fails only on `SIGN_IN_SUCCEEDED`.

Context7 facts (2026-11-03): the bearer plugin resolves the session from `Authorization: Bearer`; `signOut` is an exported server API and revokes the current session. `APIError` exposes `statusCode`, `status`, and `body.code`.

**Alternative rejected:** relying on the library's transaction for the audit row. The library owns session creation; there is no hook that lets us write the audit row in the same transaction. Revoking on failure is the smallest fail-closed behavior.

### D6 - Audit FK `RESTRICT` and pseudonymization

Change `audit_logs.actor_user_id` to `references(() => users.id, { onDelete: "restrict" })` in `trust.ts`, run `pnpm --filter api db:generate`, review `0004_*.sql`, and commit the snapshot. `consent_records.user_id` is already `RESTRICT`. The test deletes a referenced user and expects SQLSTATE `23503`. The privacy/deletion change uses pseudonymization; a hard delete of a user with ledger rows is refused by design (D-42).

Context7 facts (2026-11-03): Drizzle `references()` accepts the second argument `{ onDelete: "restrict" }`, and generated PostgreSQL migrations emit `ON DELETE restrict`.

**Alternative rejected:** a database trigger. It adds a second enforcement path beside the grant set, and the user explicitly chose grants plus RESTRICT (D-42). **Alternative rejected:** `SET NULL` with a separate actor snapshot column. It adds a column and still rewrites the row.

### D7 - Verify redirect uses the configured origin

Expose `BETTER_AUTH_URL` to the web service in `compose.yaml` and read it in a server-only `appOrigin()` helper. Validate the parsed URL protocol is `http:` or `https:`; build `/verify?status=...` on that origin. Do not read `Host` or `x-forwarded-proto` for the redirect. Tests set `BETTER_AUTH_URL`, spoof `Host: evil.example` and `x-forwarded-proto: javascript`, and assert the `Location` stays on the configured origin.

**Alternative rejected:** an allowlist of request hosts. It needs a second source of truth and still trusts a request header. **Alternative rejected:** a relative `Location`. `NextResponse.redirect` requires an absolute URL.

### D8 - BFF hardening

- `readSessionCookie`: wrap `decodeURIComponent` in try/catch; return `null` on `URIError`.
- `proxyJson` and the sign-in route: reject `Content-Length > 128 KiB` with a `413` problem before parsing. For a chunked body, read `request.body` with a `ReadableStream` reader, count bytes, cancel at the cap, decode with `TextDecoder`, and then parse. The cap matches the API's 100 KiB body limit with headroom; a profile form never approaches it.
- A shared `forwardUpstream` helper parses JSON; if the upstream body is non-JSON, it returns a `502` problem body instead of `{}`. The log keeps the upstream status and a short reason.
- `BFF_MAX_BODY_BYTES = 128 * 1024` is one named constant.

Context7 facts (2026-11-03): Next.js route handlers receive a Web `Request`; `request.body` is a `ReadableStream`. Next's general 10 MB body-clone limit only truncates the clone and does not reject the request, so the BFF must enforce its own cap.

**Alternative rejected:** `request.text()` followed by a length check. It buffers the whole body first, which is the problem being fixed.

### D9 - Taxonomy bounds and keyset pagination

- `normalizeFieldName`: keep `NFKC`, then remove `/[\p{Cf}]/gu`, then trim/collapse/lowercase.
- `isAcceptableFieldName`: after normalization, require `/\p{L}|\p{N}/u`; otherwise return `422`.
- `MENTOR_FIELD_TOTAL_MAX = 5` (4 additional + primary) and `PROFILE_LANGUAGE_MAX = 5`; validate after `distinctFieldNames`/`normalizeLanguages`.
- `GET /v1/fields`: query params `limit` (integer, default 100, max 200) and `cursor` (last slug). Order by `normalized_slug`, select `limit + 1`, return `{ fields, next_cursor }`; `next_cursor` is the last slug when more rows exist, otherwise null. Invalid limit → `422`.
- The profile page and BFF pass no cursor initially; the first page is 100. The UI can add a "load more" later without a contract change.

Node facts verified locally on 2026-11-03: `/\p{Cf}/u.test("\u200B")` is true; `"\u200B".trim()` does not remove it; `"ＡＩ".normalize("NFKC")` is `AI`; `ReadableStream` and `TextDecoder` are available.

**Alternative rejected:** offset pagination. It is unstable when fields are created between pages and lets a caller walk an unbounded table. **Alternative rejected:** order by display name with a `(name, id)` cursor. It is valid but more complex; the user chose the slug cursor (D-43). **Alternative rejected:** drop zero-width characters only from the display name but keep the slug. It would leave duplicate/invisible slugs.

### D10 - Stitch reference for the two UI screens

Stitch was used at propose time (2026-11-03) with the project **`connect — Sprint 1 hardening UI`** (`projects/7444600524954243355`). Design system: **`assets/95b57ed14db640e5846542624aa18389`** ("Civic Trust": Public Sans, `#0D4D43`, 48 px touch targets, WCAG AA).

- **Forgot password** — `projects/7444600524954243355/screens/4d4ed8f5e03a47fdbb27e2d1b7f4f8bf`, title "Forgot password — connect (All States)", mobile. Shows default, loading, success, invalid-email, and network-error states.
- **Create account / under-18 error** — `projects/7444600524954243355/screens/9e9d43e971594b06912f9568ab7e5984`, title "Create account — connect", generated as desktop. It is a reference for the error treatment; the implementation stays mobile-first and follows the app's existing simple layout and string catalog.

The generated HTML is not pasted into the app. The implementation uses the Stitch layout, type scale, and semantic error treatment as guidance, keeps the existing string catalog, and does not introduce a design-system dependency. If the Stitch project is unavailable at apply, record the error; do not silently fall back to an unreviewed design.

### D11 - Local setup and boot error

`identity.config.ts` changes the error to `BETTER_AUTH_SECRET must be set to at least 32 characters (generate one with: openssl rand -base64 32)`. `docs/local-setup.md` adds the generation step to the one-command block and documents the `connect_app` login-role/membership step. The docs are already updated in `20ef00d`; the apply task only changes the error text and verifies the doc.

### D12 - `.dockerignore` hygiene

Add `opencode.json`, `AGENTS.local.md`, `dbhub.toml`, and `.mcp-memory.jsonl`. They are untracked/local but present in a developer's build context; the Dockerfiles use explicit `COPY`, so this is context hygiene, not an image-layer fix.

### D13 - Debt and deferred work

`docs/known-debt.md` (added in `20ef00d`) records `SEC-API-1` (Sprint 7), rate limiting/CSRF (Sprint 7), the status/session race (`FR-ADM-05`), the backfill audit gap, SMTP retry (6a), dev advisories, confusables (Phase 1b), and the accepted under-18 block risk (D-40). `@types/nodemailer` stays because `nodemailer@10.3.1` has no bundled types; the earlier audit's "redundant" note is withdrawn.

## Risks / Trade-offs

- **Timing measurement is noisy** → 20 samples, median, ratio <1.5×; record the numbers; a failure is a signal to investigate, not a deterministic unit test.
- **CI runtime grows** → the service and 47 tests add roughly 1–2 minutes; the `checks` job keeps its name, so the ruleset does not change.
- **Pagination changes field order** → the response gains `next_cursor`; the UI's first page is unchanged at 100. A client that assumed name order sees slug order.
- **RESTRICT blocks hard deletion** → intentional; pseudonymization is the deletion path. The privacy change must implement it.
- **`hashPassword` on the existing path costs CPU** → it is the point; rate limiting in Sprint 7 bounds abuse. An attacker can still spend CPU on registration attempts.
- **128 KiB body cap** → current profile text has no maximum and could theoretically exceed it; the API's 100 KiB limit already rejects such a body, so the BFF cap only moves the rejection earlier.
- **Stitch screen 2 is desktop** → the design is a reference; the implementation is mobile-first. Record this in the apply handoff.
- **Future tables need grants** → the test names the five tables; a new migration must add its own grant. A default-privilege change is a follow-up if the table count grows.
- **`BETTER_AUTH_URL` is now required by the web service** → Compose sets it; a host `pnpm dev` needs it for the verify redirect, with a localhost development fallback.

## Migration Plan

1. Add `0003_grant_profile_tables.sql` and `0004_audit_fk_restrict.sql`; change `trust.ts`; run `pnpm --filter api db:generate`, review both SQL files, and commit the snapshots.
2. Apply to a clean volume: `docker compose down -v`, `up -d --build`, `pnpm --filter api db:migrate` twice (the second is a no-op), `db:seed`.
3. Run the grants test with `SET ROLE connect_app`, the audit-delete test, and the full suite with `DATABASE_URL` set.
4. Rollback: revert the branch. The migrations are forward-only; `0003` only adds grants and `0004` changes one FK action. No production data exists.

## Still UNVERIFIED after this change

These are deliberately not claimed fixed; they need a different environment or a later change:

- SMTP failure path and whether a provider error message can contain a recipient address in logs.
- The development overlay's hot reload (`compose.dev.yaml`).
- The container health flip when `GET /readyz` returns `503`.
- `Secure` cookie behavior on a LAN-IP browser over plain HTTP.
- Schema-versus-snapshot parity beyond the queries the integration suite exercises.
- Behaviour behind a real reverse proxy (Host/XFP handling).
- A real login role in `connect_app` (the test uses `SET ROLE`; no login role is created).
- CORS from another origin.
- The 18+ UTC boundary near Dhaka midnight.
- Trivy/CI image-scan internals (only the green status is observed).

## Open Questions

None. The delegated decisions are recorded in D-40 to D-44; no answer from Samiul is needed before apply.
