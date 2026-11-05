# Design

## Context

See `proposal.md` — Why. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified live 2026-11-05, re-check at apply):**

- `main` at `2716a44`; all four gates green, 172 tests passing with 0 skipped under `CI=true`. Migrations `0000`–`0006` exist; `0006` is the hand-written grant step for `two_factors`.
- **No role schema at all:** `services/api/src/db/schema/enums.ts` has no `role` enum, there is no `role_assignments` table, and `services/api/src/db/schema/auth.ts` carries users, sessions, accounts, verifications, and `two_factors` only.
- `services/api/src/profiles/profiles.controller.ts` resolves the acting user with `this.identity.getSession({ sessionToken: bearerToken(request) })` and nothing else; `PUT /v1/me/mentor-profile` is open to every signed-in account.
- `audit_logs.actor_role` is a text column; registration writes `"USER"`, suspension writes `"PLATFORM_ADMIN"`. The `AuditAction` union lives in `services/api/src/identity/audit-log.ts`.
- `packages/domain/src/identity.ts` exposes `IdentityErrorCode` with `FORBIDDEN` already mapped to `403` and titled "This account cannot sign in" — a sign-in failure, not a role denial.
- `GET /v1/me` is composed in `me/me.controller.ts` from `AccountSummary` plus the two profiles, and documents that it restates the account fields on purpose instead of reusing `AccountSummary` for sign-in.
- `docs/data-model.md` §5.1 already specifies `role_assignments` (unique active row per `user_id`, `role`, `institution_id`; revoked, never deleted) and §4.1 already specifies the five `role` values. `docs/auth-and-access-control.md` §3 requires per-request resolution from the database, not from a token.

## Goals / Non-Goals

**Goals**

- A role is stored, granted, read, and enforced through one path.
- The first real enforcement point exists and is tested end-to-end.
- FR-PROF-04 and the MFA-by-role rule exist as tested policy before #5 and #6 need them.
- Nobody is stranded: an account from before this change can opt in with one click.

**Non-Goals**

- The admin surface, role administration, role revocation endpoints, and the admin session timeouts — Sprint 7.
- A public mentor-profile endpoint, discovery, or matching — #5 and #6.
- Institution-scoped grants — nothing creates an institution admin until the admin surface exists.
- Mentor activation, affiliation, availability, access mode — #5 and 4b.
- Rate limiting, CSRF, and unknown-field rejection on the new endpoint — Sprint 7 (DEBT-01, DEBT-02, DEBT-03).

## Decisions

### D1 — One table, one enum, one partial unique index

`role_assignments`: `id uuid PK default gen_random_uuid()`, `user_id text NOT NULL` FK `users.id` on delete cascade, `role role NOT NULL`, `institution_id uuid?` FK `institutions.id` on delete restrict, `granted_by_user_id text?` FK `users.id` on delete set null, `granted_at timestamptz NOT NULL default now()`, `revoked_at timestamptz?`.

The "at most one active row" rule needs a partial unique index that treats a missing `institution_id` as one value, because Postgres treats `NULL`s as distinct in a unique index:

```sql
CREATE UNIQUE INDEX role_assignments_active_unique
  ON role_assignments (user_id, role, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;
```

A check constraint requires `institution_id` when the role is `INSTITUTION_ADMIN`, mirroring `docs/data-model.md`. The migration ends with `GRANT SELECT, INSERT, UPDATE, DELETE ON role_assignments TO connect_app` — the same hand-written step `0003` and `0006` used, because a table without a grant is the Sprint 1 audit finding.

Rejected: storing roles as a text array on `users` — it cannot express scope, grant metadata, or revocation history.

### D2 — STUDENT is written at registration; MENTOR is only ever opted into

`register()` already opens a transaction for the consent rows, the age-gate fields, and `USER_REGISTERED`; the `STUDENT` insert joins that transaction, so the "account without a role" state cannot exist.

The migration grants `STUDENT` to every pre-existing account and writes one `ROLE_GRANTED` audit row per account in the same statement pair, so the backfill does not repeat DEBT-10 (a backfill that left no audit trail). `MENTOR` is **not** backfilled, because the owner's decision is that the role is opt-in: an account that already holds a mentor profile sees a "become a mentor" action on the profile page, calls `POST /v1/me/roles/mentor`, and saves again. That is one extra click, and it leaves the role history honest.

Rejected: backfilling `MENTOR` from the existence of a mentor profile — it would grant a privileged role from an inference, and the corresponding audit row would claim a consent the account never gave.

### D3 — The role check is one explicit helper, not a decorator or a global guard

`services/api/src/authorization/authorize.ts` exports `actingAccountWithRoles(request)` and `requireRole(request, role, options)`, which resolve the session through the existing `IdentityService.getSession`, then read the account's active assignments and refuse with `ROLE_REQUIRED`. Controllers call it exactly where they call `actingAccount` today.

Rejected: a NestJS guard plus a `@Roles()` decorator — it needs either a global guard (which would silently change every route) or per-route metadata that is invisible in the request handler; the repo's controllers are explicit and the diff stays smaller and more readable this way. Rejected: extending `getSession` to return roles — `AccountSummary` is also the sign-in shape, and roles must not leak into it.

An empty role set is a refusal, not a pass: `requireRole` checks membership, it never checks "is there a roles field at all".

### D4 — Roles are read per request, never cached

The roles read is a single indexed query on `role_assignments` (`user_id`, `revoked_at IS NULL`), issued after the session read that already happens on every request. A revocation therefore takes effect on the next request, which the matrix test asserts by revoking mid-session.

Rejected: caching roles in a signed cookie or on the session row — it would keep a revoked role alive for the session's lifetime, which is exactly the failure `docs/auth-and-access-control.md` §3 forbids.

### D5 — Two new problem codes, not a reused `FORBIDDEN`

`FORBIDDEN` is authored for the sign-in gate ("This account cannot sign in") and is asserted by existing sign-in tests. A role denial needs a different code so the web app can offer the opt-in and so a client can tell "you may not sign in" from "you lack a role":

| Code | Status | Meaning |
|---|---|---|
| `ROLE_REQUIRED` | 403 | The account is signed in and may not perform this action without the role |
| `MFA_REQUIRED` | 403 | The account holds the role but has no enrolled second factor |

Both join `problem-details.filter.ts` and the error catalog in `packages/contracts/openapi.yaml`.

### D6 — The MFA flag is wired now, deliberately without a route that sets it

`requiresMfa(role)` lives in `packages/domain` and answers true for `MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN`. `requireRole(..., { requiresMfa: true })` refuses with `MFA_REQUIRED` when the account has no active factor (`users.two_factor_enabled`). No route in this change passes the flag.

This is a deliberate exception to D-47's "no guard with no consumer" reasoning, and it is the owner's call: #5 needs the mechanism the moment activation begins, and there is no admin route to hang it on yet. To keep it from being untested, the policy is unit-tested per role and the guard's MFA branch is integration-tested by calling `requireRole` directly with the flag — no test-only HTTP route is added. `PUT /v1/me/mentor-profile` is **not** flagged, because gating it would lock a just-opted-in mentor out of their own profile form (FR-AUTH-04 says "before any role-specific action", and #5 owns the first such action).

### D7 — The visibility policy is pure, total, and caller-supplied

`packages/domain/src/visibility.ts`:

```ts
type ProfileKind = "STUDENT" | "MENTOR";
interface ProfileViewer {
  authenticated: boolean;
  isOwner: boolean;
  roles: Role[];
  hasRequestFromSubject: boolean;   // the viewer is the mentor that student asked
  hasInstitutionConsent: boolean;   // active consent for this institution and purpose
  hasCaseReference: boolean;        // a dispute or support case for a break-glass read
}
canViewProfile(viewer: ProfileViewer, kind: ProfileKind): "VISIBLE" | "HIDDEN"
```

The function is total (every input combination has an answer) and does no I/O. The caller is responsible for resolving consent and case references; the policy never guesses them. A `HIDDEN` answer means "behave as if the object does not exist", per `docs/auth-and-access-control.md` §8.1.

| Viewer | Student profile | Mentor profile |
|---|---|---|
| Owner | `VISIBLE` | `VISIBLE` |
| No session | `HIDDEN` | `HIDDEN` |
| Student, not the owner | `HIDDEN` | `VISIBLE` |
| Mentor with a request from that student | `VISIBLE` | `VISIBLE` |
| Mentor without a request | `HIDDEN` | `VISIBLE` |
| Institution admin with consent | `VISIBLE` | `VISIBLE` |
| Institution admin without consent | `HIDDEN` | `VISIBLE` |
| Platform admin with a case reference | `VISIBLE` | `VISIBLE` |
| Platform admin without a case reference | `HIDDEN` | `VISIBLE` |

The matrix test drives exactly this table plus the exhaustive cross-product, so a cell that is documented but not covered (or the reverse) fails the run.

### D8 — The web app learns roles from `GET /v1/me` and offers the opt-in where it is needed

`GET /v1/me` gains `roles: Role[]` (stable order: the five enum values in declaration order). The profile page's mentor form checks for `MENTOR`:

- absent → show the mentor fields read-only with a "Become a mentor" action; the action calls `POST /api/me/roles/mentor` (a thin BFF route), then reloads `/api/me`.
- present → the form behaves exactly as today.

A `403 ROLE_REQUIRED` from the save is mapped to the same opt-in prompt, so a stale page also recovers instead of showing a dead form.

### D9 — Contract and docs surface

| Surface | Change |
|---|---|
| `POST /v1/me/roles/mentor` | New. `200 { roles: [...] }`. Idempotent. No body. Audited on an actual grant. |
| `GET /v1/me` | Gains `roles`. |
| Error catalog | Gains `ROLE_REQUIRED`, `MFA_REQUIRED` (403). |
| `docs/data-model.md` | §4.1 `role` marked built; §5.1 `role_assignments` marked built with the final columns and the index. |
| `docs/auth-and-access-control.md` | §3 per-request resolution implemented; §8.1 role guard implemented; §9 matrix gains a pointer to the policy function and its test. |
| `docs/security-requirements.md` | SEC-AUTH-2 evidence for the policy half; FR-AUTH-07 evidence. |
| `docs/known-debt.md` | DEBT-14 narrows to profile visibility wiring and the admin timeouts. |

## Assumptions

- `institutions` exists and is seeded, so the `institution_id` FK is satisfiable (verified: `0000` baseline plus the institution seed).
- The account row carries `two_factor_enabled`, so `requiresMfa` needs no second table read (verified: migration `0005`, `users.two_factor_enabled`).
- `EMPLOYER` stays reserved: no code grants it, and the policy treats it as a role that requires no factor.
- The role list on `GET /v1/me` is enough for the UI; no separate roles endpoint is needed while the only self-grantable role is `MENTOR`.

## Risks

| Risk | Mitigation |
|---|---|
| A gated endpoint is added later without the guard, silently reopening the hole | The permission-matrix test enumerates every registered route and fails when a route has no declared role requirement (design: the test walks the controller metadata list). |
| The migration's unique index rejects legitimate rows for institution-scoped roles | The index uses the `COALESCE` sentinel and the test inserts a `NULL`-scope and an institution-scoped row for the same role. |
| The backfill's audit rows inflate the log | One row per account, action `ROLE_GRANTED`, actor null (system), with a `reason` naming the migration. |
| `MFA_REQUIRED` ships without a consumer and rots | The policy is unit-tested and the guard branch is integration-tested; #5's first task names it as the consumer. |
