# Proposal

## Why

Connect has no authorization layer. Every endpoint trusts a valid session and nothing else: `PUT /v1/me/mentor-profile` is open to any signed-in account, roles do not exist in the database (`role_assignments` has never been created), and `audit_logs.actor_role` is a free-text value written as `"USER"` by registration. FR-AUTH-07 (`Must`, "role-based and object-level authorization on every endpoint") and SEC-AUTH-2 (MFA enforced for Mentor, Institution Admin, and Platform Admin) are therefore unmet, and DEBT-14 records it.

This is the next Sprint 2 change and the one #5 depends on: a mentor is activated only when Level 1 affiliation, MFA, and the agreements are all present (FR-PROF-03), which needs a role to key that rule on. Building #5 first would ship activation against a role that does not exist. The plan's Sprint 2 order is 4a → 4c → 4b → #5 → #6, so 4b follows this change and uses the role it introduces.

## What Changes

- **A role model in the database.** A `role` enum (`STUDENT`, `MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN`, `EMPLOYER`) and the `role_assignments` table from `docs/data-model.md` §5.1: `user_id`, `role`, `institution_id?`, `granted_by_user_id?`, `granted_at`, `revoked_at?`, with at most one active row per (`user_id`, `role`, `institution_id`). One forward-only migration, application-role grants included, because an ungranted table is the Sprint 1 audit finding.
- **STUDENT by default.** Registration grants `STUDENT` inside the transaction that already writes consent rows, the age-gate fields, and the `USER_REGISTERED` audit entry — so an account never exists without its default role.
- **MENTOR is self-service opt-in.** `POST /v1/me/roles/mentor` grants it idempotently and writes one `ROLE_GRANTED` audit entry. The role deliberately grants **no visibility and no activation**: a mentor with the role and no profile, no affiliation, and no MFA is still invisible to everybody. Activation stays with #5.
- **Role resolution on every request, and a reusable guard.** Roles are read from `role_assignments` for the session's account on each request (never cached in a token, per `docs/auth-and-access-control.md` §3). A single authorization helper resolves the acting account and its roles and refuses with `403 ROLE_REQUIRED`. Its first real consumer is `PUT /v1/me/mentor-profile`, which now requires the `MENTOR` role.
- **An MFA policy that #5 can reuse.** `requiresMfa(role)` is a pure domain function that answers true for `MENTOR`, `INSTITUTION_ADMIN`, and `PLATFORM_ADMIN`, and the guard can be declared as MFA-requiring, refusing with `403 MFA_REQUIRED`. No route sets that flag in this change: role grant does not gate sign-in or the app, and #5 is the first runtime consumer (design D6 explains why this is deliberate).
- **The FR-PROF-04 visibility matrix as a pure function.** `canViewProfile(...)` decides, for every (viewer role, subject kind) pair, whether a profile is visible or must behave as if it does not exist. A data-driven matrix test covers every pair. No read endpoint is added; the first consumer is discovery (#6) and #5.
- **`GET /v1/me` reports the caller's roles**, so the web app can decide which actions to offer without a second call.
- **The mentor form offers the opt-in.** When an account has a mentor profile but not the role (every account that saved one before this change), the profile page shows a one-click "become a mentor" action that calls the new endpoint and then allows saving, instead of leaving a 403 with no way out.
- **Two problem codes** join the catalog: `ROLE_REQUIRED` and `MFA_REQUIRED`, both `403`, with contract entries and `docs/api-contracts.md` rows.

## Capabilities

### New Capabilities

- `identity/role-authorization`: the role model, how roles are granted and resolved, the role guard, and the MFA requirement keyed on a role.
- `profiles/profile-visibility`: who may see which profile, expressed as a pure policy with a complete matrix test.

### Modified Capabilities

- `profiles/student-and-mentor-profiles`: saving a mentor profile now requires the `MENTOR` role, and the refusal is a stated outcome.

## Impact

- **Code:** `services/api/src/db/schema/auth.ts` (or a new `roles.ts`) plus `enums.ts`, migration `0007`, `services/api/src/identity/*` (registration default role, role reads and grants, audit actions), a new `services/api/src/authorization/*` module (guard helper, role resolution), `services/api/src/profiles/profiles.controller.ts` (mentor write gated), `services/api/src/me/me.controller.ts` (roles in the response), `packages/domain/src/identity.ts` (role types, `requiresMfa`, new error codes), a new `packages/domain/src/visibility.ts`, `packages/contracts/openapi.yaml`, and `apps/web` only where a refusal must be shown (the mentor-profile form's error mapping) plus the string catalog.
- **Data:** one new table and one new enum. No existing row is rewritten. The migration grants `STUDENT` to every existing account (so no account is role-less) and writes one `ROLE_GRANTED` audit row per account it backfills, so the backfill does not repeat DEBT-10's missing audit trail. `MENTOR` is **not** backfilled: the role is opt-in, and an account that already has a mentor profile opts in with one click on the profile page (design D2).
- **Dependencies:** none.
- **Docs:** `docs/data-model.md` §4.1 and §5.1 (role enum, table marked built), `docs/auth-and-access-control.md` §3 and §8–9, `docs/api-contracts.md` (new endpoint, two problem codes, `roles` on `/v1/me`), `docs/security-requirements.md` (SEC-AUTH-2 evidence, FR-AUTH-07 evidence), `docs/known-debt.md` (DEBT-14 narrowed), `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md` (change 4c status), `docs/decision-log.md` (new rows).

## Out of scope

- The admin surface (platform admin dashboards, role administration UI) and the admin idle/absolute session timeouts — Sprint 7, per the owner decision recorded in `account-access-ui`.
- A public mentor-profile read endpoint and mentor discovery — #5 and #6.
- Institution-scoped granting of `INSTITUTION_ADMIN` (no institution admin exists yet; the table supports `institution_id` and the guard checks it, but nothing grants it until the admin surface).
- Role revocation via the API — the table supports `revoked_at`, and revocation belongs with the admin surface.
- Mentor activation, affiliation, onboarding, availability, or access mode — #5, 4b.
- Rate limiting and CSRF for the new endpoint — Sprint 7 (DEBT-02, DEBT-03).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Gating the mentor write breaks every existing mentor-profile test and any account that already has a profile | Tests grant the role through the new endpoint in their setup. The migration grants `STUDENT` to every existing account with an audit row per account, and an existing mentor-profile owner is offered the one-click opt-in on the profile page rather than being stranded. |
| A role check that silently passes on a missing role row is worse than no check | The guard treats an unknown or empty role set as a refusal; the matrix test asserts `ROLE_REQUIRED` for every endpoint/role pair that must be denied, including the no-role case. |
| Roles cached in the session would keep a revoked role alive | Roles are read per request from the table; the matrix test revokes a role mid-session and asserts the next request is refused. |
| The MFA policy and the visibility matrix ship without a runtime consumer | Both are pure, tested policy with the exact consumer named in the design (#5 and #6). This is the one deliberate deviation from D-47's "no policy without a consumer" rule, taken because the owner asked for them now (design D6, D8). |
| A per-request role query adds a round trip | One indexed query on a primary-key-prefixed table, on the same connection pool the session read already uses. |

Rollback: revert the branch and drop the local volume; the schema change is additive, a reverted database keeps working, and no ledger row is rewritten.

**Traces to** FR-AUTH-07 (role and object-level authorization), FR-AUTH-04 (MFA for privileged roles — the policy half), FR-PROF-04 (profile visibility), FR-AUTH-06 (dual roles: one account may hold Student and Mentor), SEC-AUTH-2 (MFA enforced for privileged roles), SEC-AUTH-4 (no token-borne authority), ADR-012 (pure policy functions in `packages/domain`), D-46 (the provider path cannot bypass MFA), D-47 (this change is the 4c split).
