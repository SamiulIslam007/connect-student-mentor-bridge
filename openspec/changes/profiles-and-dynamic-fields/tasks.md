# Tasks

## 1. Decisions and Schema Foundation

- [ ] 1.1 Add the two owner decisions to `docs/decision-log.md` as the next free rows (D-38 and D-39 at propose time): weekly capacity maximum 5 as a **Proposed default** that Sprint 7 configuration replaces, and `If-Match` dropped for the profile PUTs (last write wins). Save both to the `memory` MCP with the `connect:` prefix. Verify: both rows carry Date, Decision, Reason, Status and Affects, and `git diff docs/decision-log.md` shows only additions.

- [ ] 1.2 Create `services/api/src/db/schema/columns.ts` exporting the `citext` custom type and the `timestamps` helper, and import them from `services/api/src/db/schema/trust.ts` instead of its private copies. Verify: `pnpm --filter api typecheck` passes, and with Compose Postgres running `pnpm --filter api test` still passes the identity and seed integration suites.

- [ ] 1.3 Add `field_status` (`ACTIVE`, `RETIRED`) and `mentor_status` (`DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED`) to `services/api/src/db/schema/enums.ts`, add `services/api/src/db/schema/fields.ts` (`fields`) and `services/api/src/db/schema/profiles.ts` (`student_profiles`, `student_field_interests`, `mentor_profiles`, `mentor_fields`) per design D1, and export both from `services/api/src/db/schema/index.ts`. Every `user_id` is `text` referencing `users.id`; join tables use composite `primaryKey`; `languages` is `text[]` defaulting to `'{}'::text[]`; `weekly_capacity` carries a `>= 1` check only. Verify: `pnpm --filter api typecheck` passes.

- [ ] 1.4 Generate the migration with `pnpm --filter api db:generate`, review `services/api/drizzle/0002_*.sql` by hand (FK types, `citext`, checks, composite primary keys), and add `fields`, `student_profiles`, `student_field_interests`, `mentor_profiles` and `mentor_fields` to `truncateAll` in `services/api/test/support/database.ts`. Verify: with Compose Postgres running, `pnpm --filter api test` resets `connect_test` from every migration and the suite passes; a second run passes too, proving no field leaks between runs.

- [ ] 1.5 Correct `docs/data-model.md`: `uuid` → `text` for every `user_id` in §5.1–§5.2, add `field_status` and `availability_context` to §4.1, record `mentor_status` as written by this change, resolve the mentor primary field to `mentor_profiles.primary_field_id` (drop `is_primary` from `mentor_fields`), define the profile tables' own `id` columns, and annotate each deferred column with its owning change (`access_mode` → `profile-availability-and-access-mode`; `onboarding_status`, `orientation_completed_at`, `activated_at`, `current_role_*`, `student_profiles.onboarding_completed_at` → change #5). Verify: walk `services/api/drizzle/0002_*.sql` column by column against §5.2 — no `uuid` user key, no column the migration does not create, no created column the doc omits.

## 2. Pure Domain Rules

- [ ] 2.1 Add `packages/domain/src/fields.ts` with `normalizeFieldName` per design D2 and `FIELD_NAME_MAX_LENGTH = 100`, plus `packages/domain/test/fields.test.ts` covering case and separator collisions, separator runs, Bangla input staying non-empty, NFKC full-width folding, punctuation staying significant (`C++` ≠ `C`), and empty input normalizing to an empty string. Verify: `pnpm --filter @connect/domain test` passes.

- [ ] 2.2 Add `packages/domain/src/profiles.ts` with `MENTOR_WEEKLY_CAPACITY_MAX = 5`, `STUDENT_INTEREST_FIELD_MAX = 2`, `validateStudentProfileInput` and `validateMentorProfileInput` returning a list of problems (empty means valid), export both new modules from `packages/domain/src/index.ts`, and add `packages/domain/test/profiles.test.ts` covering required text, capacity 1/5/0/6/2.5/`"3"`, more than two interests, an interest equal to the primary field, duplicate interests collapsing, and language codes being case-folded and deduplicated. Verify: `pnpm --filter @connect/domain test` passes.

## 3. API

- [ ] 3.1 Add the `profiles` module: `profiles.tokens.ts`, `drizzle-profiles.service.ts` with the transactional field upsert (design D3) and the student-profile save (full replace, validation before the transaction per D6), `profiles.controller.ts` with `PUT /v1/me/student-profile`, `profiles.module.ts`, and register `ProfilesController` in `app.module.ts`'s middleware list. Add an integration test that proves create, full replace of interest fields, `401` without a session, a body `user_id` being ignored, and `request_id` present in a `422` problem body. Verify: with Compose Postgres running, `pnpm --filter api test` passes.

- [ ] 3.2 Add `PUT /v1/me/mentor-profile` to the same controller and service: required text fields, primary plus additional fields, capacity bounds, full replace of `mentor_fields`. Extend the integration test with capacity boundary cases, additional-field replacement, and the atomicity case (a new field name submitted with an invalid capacity leaves no field row). Verify: `pnpm --filter api test` passes with Compose Postgres running.

- [ ] 3.3 Add `GET /v1/fields` returning `{ fields: [{ id, name }] }`, active only, sorted by name, session required. Extend the integration test with an empty taxonomy, a created field appearing, a `RETIRED` field omitted while its profile reference still reads, and `401` without a session. Verify: `pnpm --filter api test` passes.

- [ ] 3.4 Extend `GET /v1/me` with `student_profile` and `mentor_profile` (nullable) read from the new tables, keeping `AccountSummary` untouched. Update `services/api/test/identity.integration.test.ts:701-717` to assert the new exact key set while keeping the "no other user's data" assertion, and add cases for both profiles null, both present, and `account_status` submitted with a profile save being ignored. Verify: `pnpm --filter api test` passes and the updated assertion lists every returned key.

## 4. Contract

- [ ] 4.1 Add the three paths and the `MeResponse`, student-profile, mentor-profile, and field schemas to `packages/contracts/openapi.yaml`, with `MeResponse` declared standalone rather than composed from `AccountSummary` (design D4), and `account_status` documented as an accepted no-op property. Extend `packages/contracts/test/openapi.test.ts` to assert the new paths, that `MeResponse` is not an `allOf` over `AccountSummary`, and that both profile properties are nullable. Verify: `pnpm --filter @connect/contracts test` passes.

- [ ] 4.2 Update `docs/api-contracts.md`: §5.1 gains the two PUTs without `If-Match` and documents the body shape and `200/401/422` responses; §5.3 notes that `GET /v1/fields` ships with this change. Verify: every path, status code, and schema name in §5.1/§5.3 matches `openapi.yaml`, checked by reading both side by side.

## 5. Web

- [ ] 5.1 Add an optional `method` parameter to `proxyJson` in `apps/web/lib/bff.ts` (default `POST`), add the BFF routes `app/api/me/student-profile`, `app/api/me/mentor-profile` (PUT) and `app/api/fields` (GET), and add the profile strings to `apps/web/lib/strings.ts`. Add route tests covering the session cookie being forwarded, `401` when absent, and the upstream status being passed through. Verify: `pnpm --filter web test` passes.

- [ ] 5.2 Add `apps/web/app/profile/page.tsx` with a student section and a mentor section that load current values from `/api/me`, use a native `<input list>` fed by `/api/fields` for pick-or-create, and save each section with its own PUT, surfacing the problem `detail` on failure. Link the page from `apps/web/app/account/page.tsx`. Verify: `pnpm --filter web typecheck` and `pnpm --filter web build` pass, and the page renders both sections in a manual `docker compose up` check.

## 6. Documentation Conformance and Integration

- [ ] 6.1 Fix `docs/auth-and-access-control.md:79`: an unverified user cannot sign in or complete a profile; activation on email verification is the only path to a profile (FR-AUTH-08, `identity/account-status-lifecycle`). Verify: the sentence no longer contradicts the lifecycle spec, and no other line in the file still claims unverified users can sign in.

- [ ] 6.2 Update the trackers in the same branch: add `FR-PROF-01, 02` to Sprint 1's Requirements column in `docs/milestones-and-phases.md:103`, refresh the "Current state" block, add `GET /v1/fields` and the `/v1/me` extension to change #4's row in `docs/mvp-build-plan.md:95` and mark it `IN PROGRESS`, and update the status line in `README.md`. Verify: no document still calls #4 `PLANNED` or omits the profile FRs from Sprint 1.

- [ ] 6.3 Run the four project gates from the repository root with Compose Postgres running: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Verify: all four exit 0, and paste the real output in the handoff; a skipped integration suite counts as UNVERIFIED, not as a pass.

- [ ] 6.4 Run the review gate on the diff: `/ponytail-review`, `/ce-code-review`, the `silent-failure-hunter` subagent, the trust-rule check (unconfirmed never counts, neutrality firewall, append-only ledger, object-level authorization, audit log, consent records, erasure design), `/ponytail-debt`, and `review-diff`. Verify: every finding is either fixed in scope or reported in the handoff with a reason it was not.

- [ ] 6.5 Write the handoff report: what changed, docs updated, stale docs found but not fixed, the `SEC-API-1` unknown-field gap recorded as debt, the exact gate output, and the branch commit list. Verify: every claim traces to a command that was run in this session.

## Workflow follow-up

- Archive only when the owner asks: run docs-sync, `/ce-compound`, the `memory` update, `openspec archive`, and `openspec validate --archived --strict` with this change's own entry showing `"valid": true` and `"issues": []`.
- Run the git lifecycle from `AGENTS.local.md` section 6: push the branch, open the PR, merge only on green checks, and paste the raw `git log --oneline -3` from `main`.
- After archive, set change #4 to `DONE` with the PR number, date, and test count, and update the README status line.
