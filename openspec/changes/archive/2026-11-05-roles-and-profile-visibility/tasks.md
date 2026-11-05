# Tasks

## 1. Schema

- [x] 1.1 Add the `role` enum (`STUDENT`, `MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN`, `EMPLOYER`) to `services/api/src/db/schema/enums.ts` and a `roleAssignments` table in a new `services/api/src/db/schema/roles.ts` (`id`, `user_id`, `role`, `institution_id?`, `granted_by_user_id?`, `granted_at`, `revoked_at?`), exported from the schema index. Include the check that `institution_id` is required for `INSTITUTION_ADMIN`. Verify: `pnpm --filter api typecheck` passes and the column list matches `docs/data-model.md` §5.1 line for line.
- [x] 1.2 Generate migration `0007_*` with `pnpm --filter api db:generate`, then add the hand-written steps in the same reviewed file: the partial unique index `role_assignments_active_unique` with the `COALESCE` sentinel, and `GRANT SELECT, INSERT, UPDATE, DELETE ON role_assignments TO connect_app`. Verify: `pnpm --filter api db:migrate` applies twice with the second run a no-op, and an integration test running as `SET ROLE connect_app` inserts and reads a row.
- [x] 1.3 Add the backfill to migration `0007`: `STUDENT` for every existing account, plus one `ROLE_GRANTED` audit row per backfilled account with a null actor and a reason naming the migration. Verify: on a database seeded before the migration, every account has exactly one `STUDENT` row and one matching audit row; a second migrate changes nothing.

## 2. Roles in the domain and the identity service

- [x] 2.1 Add `Role`, `requiresMfa(role)`, and the `ROLE_REQUIRED` / `MFA_REQUIRED` error codes to `packages/domain/src/identity.ts`. Verify: `packages/domain/test/identity.test.ts` asserts the policy for all five roles and the error-code union compiles into `IdentityError`.
- [x] 2.2 Add `listRoles(userId)` and `grantRole({ userId, role, actorUserId?, requestId })` to `IdentityService` and `BetterAuthIdentityService` (idempotent insert; one `ROLE_GRANTED` audit entry on an actual grant only), write `STUDENT` inside the existing registration transaction, and add `roles` to `GET /v1/me`. Verify: `services/api` integration tests assert the default role on registration, one audit row per grant, no second row or audit entry on a repeat, and that two accounts never see each other's roles.
- [x] 2.3 Add `POST /v1/me/roles/mentor` to a controller (identity or a new `roles` controller), returning `{ roles: [...] }`. Verify: integration tests for a first grant, a repeated grant (same response, one audit row), the caller-only rule (a body `user_id` cannot grant for another account), and that a granted role changes no other response.

## 3. Authorization

- [x] 3.1 Add `services/api/src/authorization/authorize.ts`: `actingAccountWithRoles(request)` and `requireRole(request, role, options?)`, where `options.requiresMfa` refuses with `MFA_REQUIRED` when `users.two_factor_enabled` is false. Map both new codes in `services/api/src/http/problem-details.filter.ts`. Verify: an integration test calls `requireRole` directly with `requiresMfa: true` for an unenrolled account and asserts `403 MFA_REQUIRED`, and for an enrolled one asserts success.
- [x] 3.2 Gate `PUT /v1/me/mentor-profile` behind `MENTOR` in `services/api/src/profiles/profiles.controller.ts` and update the existing mentor-profile integration tests to grant the role in their setup. Verify: an account without the role gets `403 ROLE_REQUIRED` and no row is written; every existing mentor-profile test passes again with the role granted.
- [x] 3.3 Add the permission-matrix test: a data-driven table of every registered route and the role(s) it requires, calling each as (no session, `STUDENT`, `MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN`) and asserting `401`, `403 ROLE_REQUIRED`, or success. Fail the test when a route exists that the table does not describe. Verify: `pnpm --filter api test` passes and deliberately removing a row from the table makes it fail.

## 4. Visibility policy

- [x] 4.1 Add `packages/domain/src/visibility.ts` with `canViewProfile(viewer, kind)` exactly as designed (D7), exported from the package index. Verify: `packages/domain/test/visibility.test.ts` asserts the nine documented rows and the exhaustive cross-product, and fails when the table and the implementation disagree.

## 5. Web

- [x] 5.1 Add the BFF route `apps/web/app/api/me/roles/mentor/route.ts` forwarding to `POST /v1/me/roles/mentor` with the session bearer, returning the API's body and status. Verify: `apps/web/test/` gains a route test for success, `401`, and a pass-through `403`.
- [x] 5.2 Update `apps/web/app/profile/page.tsx`: when `roles` from `/api/me` lacks `MENTOR`, render the mentor fields read-only with a "Become a mentor" action; on success reload the account and enable the form; map a `403 ROLE_REQUIRED` from a save to the same prompt. Add all copy to `apps/web/lib/strings.ts`. Verify: `pnpm --filter web build` passes; a live account without the role can opt in and then save, and an account with the role is unaffected.

## 6. Contracts and docs

- [x] 6.1 Update `packages/contracts/openapi.yaml`: the new path, the `roles` field on the `/v1/me` response, and `ROLE_REQUIRED` plus `MFA_REQUIRED` in the error catalog. Update `docs/api-contracts.md` with the new row, the two codes, and the `roles` field. Verify: the contract test passes and every implemented route appears in the document.
- [x] 6.2 Update `docs/data-model.md` (§4.1 `role` built; §5.1 `role_assignments` built with the index), `docs/auth-and-access-control.md` (§3 per-request resolution, §8.1 role guard, §9 pointer to the policy and its test), `docs/security-requirements.md` (SEC-AUTH-2 and FR-AUTH-07 evidence), `docs/known-debt.md` (DEBT-14 narrowed to the visibility wiring and the admin timeouts), `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md` (4c status and the Current state block), and `docs/decision-log.md` (new rows: the mentor role is opt-in and grants no visibility; the MFA flag ships ahead of its first consumer; role denials get their own problem codes).
- [x] 6.3 Verify the docs gate: `openspec validate --all --strict` passes and no live document still says roles, the role guard, or FR-AUTH-07 are unbuilt.

## 7. Integration, review, and handoff

- [x] 7.1 On a clean volume: `docker compose down -v`, `up -d --build`, `db:migrate` twice, `db:seed` twice, then `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`. Verify: all four gates exit 0, the second migrate is a no-op, the test run reports 0 skipped, and the count is recorded with its date.
- [x] 7.2 Review gate: `/ponytail-review` and `/ponytail-audit` (identity, authorization, and audit are all in scope), the silent-failure check, the trust-rule check (no rule in `AGENTS.md` §7 weakened), and the diff-scope check. Verify: every finding is fixed in scope or recorded in `docs/known-debt.md` with a reason.
- [x] 7.3 Handoff: the migration pair, the permission-matrix result, the roles read path, the backfill's audit proof, and what remains for #5. Verify: every claim cites a command run in this session.

## Workflow follow-up

- Archive only when the owner asks: `/ce-compound`, the memory update, `openspec archive`, and `openspec validate --archived --strict`.
- Git lifecycle from `AGENTS.local.md` §6: push the branch, open the PR, wait for green `checks` / `images` / `security`, merge with `gh pr merge <n> --merge --delete-branch`, and paste the raw `git log --oneline -3` from `main`.
