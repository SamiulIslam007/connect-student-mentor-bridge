# Tasks

## 1. Schema and migration

- [x] 1.1 Add `affiliation_kind`, `affiliation_level`, `affiliation_method`, and `affiliation_status` enums plus the `affiliations` table (columns per `docs/data-model.md` §5.1, the `institution_id IS NOT NULL OR organization_name IS NOT NULL` check, the partial unique index on `user_id` where `status = 'VERIFIED'`) — verify `pnpm --filter @connect/api typecheck` passes and `drizzle-kit generate` emits one new migration with no unrelated diff
- [x] 1.2 Add `mentor_profiles.onboarding_status` (default `APPLIED`) and `activated_at` — verify the generated migration is additive only (`ALTER TABLE … ADD COLUMN`, no rewrite) and the existing profile tests still pass
- [x] 1.3 Append the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON affiliations TO connect_app` to the new migration and extend the `SET ROLE connect_app` probe in `services/api/test/database.integration.test.ts` — verify `CI=true pnpm --filter @connect/api test database` passes with the probe exercising insert, select, and update

## 2. Domain rules

- [x] 2.1 Add `packages/domain/src/affiliation.ts`: `emailDomainOf`, `resolveAffiliationClaim({ emailDomain, verified, registeredDomains })`, and `isLevelOne` — verify unit tests cover match, unverified email, unregistered domain, mixed-case domain, and trailing whitespace
- [x] 2.2 Add `packages/domain/src/mentor-onboarding.ts` with `mentorActivation({ roles, mfaEnrolled, level, activatedAt })` returning the pair (`status`, `onboarding_status`) — verify unit tests cover every scenario in `specs/profiles/mentor-onboarding/spec.md`, including a second factor disabled after activation and `activatedAt` preserved
- [x] 2.3 Export both modules from `packages/domain/src/index.ts` — verify `packages/domain/test/index.test.ts` passes and the public export list is unchanged apart from the two additions

## 3. Claim endpoint

- [x] 3.1 Add `services/api/src/affiliations/` (module, service, controller with `POST /v1/me/affiliations`, tokens) with input validation and the documented error codes (`AFFILIATION_EMAIL_UNVERIFIED`, `AFFILIATION_INSTITUTION_MISMATCH`, `VALIDATION_FAILED`) — verify integration tests cover the grant, the pending claim, the mismatch, and that a refused claim writes nothing
- [x] 3.2 Make the claim idempotent and make a re-claim supersede: revoke the earlier verified row in the same transaction — verify integration tests assert one row per institution on repeat, and that a re-claim leaves the earlier row `REVOKED` with `revoked_at` set
- [x] 3.3 Ignore account-level body properties and never store an identity document — verify integration tests submit `user_id`, `nid`, and `passport_number` and assert the other account is untouched and no such value exists in the stored row or audit metadata
- [x] 3.4 Write one `AFFILIATION_GRANTED` and one `AFFILIATION_REVOKED` audit entry per state change — verify integration tests count audit rows after a grant and after a superseding claim
- [x] 3.5 Register the new route in `services/api/test/authorization-matrix.test.ts` (session route, student and mentor) — verify that test fails if the route is removed from the matrix and passes with it present
- [x] 3.6 Add `POST /v1/me/affiliations` to `packages/contracts/openapi.yaml` with its request body, response, and error codes — verify `packages/contracts/test/openapi.test.ts` passes and the documented example validates against the schema

## 4. Activation

- [x] 4.1 Add `syncMentorActivation(userId)` to the profiles service and call it from the claim path, the second-factor enrolment path, and the mentor-role grant — verify integration tests observe `PENDING` then `ACTIVE` for each trigger, and that disabling the second factor returns the profile to `PENDING` while the disable request still succeeds
- [x] 4.2 Extend the `GET /v1/me` payload with the caller's affiliations and the mentor profile's `status` and `onboarding_status`; update the web payload types — verify an api integration test asserts the fields and their absence for a caller with no affiliation, and `apps/web` typecheck passes

## 5. Seed

- [x] 5.1 Add `example.edu.bd` to the illustrative institution's domains in `services/api/src/db/seed/institutions.ts` — verify `seed.integration.test.ts` still passes and a rerun inserts nothing
- [x] 5.2 Add `services/api/src/db/seed/affiliations.ts` with a checked-in attestation list and wire it into `run.ts` — verify a seed integration test asserts `VERIFIED`/`ADMIN_ATTESTATION` rows with a reason, an unchanged count on rerun, and a skipped entry for an email with no account

## 6. Web

- [x] 6.1 Add `apps/web/app/api/me/affiliations/route.ts` (BFF forward, cookie to bearer) — verify `apps/web/test` route tests cover the success, the `422` problem body, and the missing-session `401`
- [x] 6.2 Add the affiliation section to `apps/web/app/profile/page.tsx`: current institution, level, status, and one claim action; every string in `apps/web/lib/strings.ts` — verify the page test covers an unaffiliated account, a verified account, and a pending account

## 7. Documentation

- [x] 7.1 Update `docs/data-model.md` (§4.1 enums, §5.1 `affiliations`, §5.2 the two new mentor columns, and mark `current_role_title`/`current_organization`/`orientation_completed_at`/`student_profiles.onboarding_completed_at` as not scheduled), `docs/api-contracts.md` §5.2 (the claim row plus a note that the admin approve/reject rows are deferred), and `docs/auth-and-access-control.md` §7 (attestation by seed) — verify each statement matches the merged code and the doc has no remaining claim that an admin approves affiliation in this release
- [x] 7.2 Add build notes to `docs/functional-requirements.md` (FR-VER-01, FR-VER-04, FR-PROF-02, FR-PROF-03, FR-PROF-05) and two debt rows to `docs/known-debt.md` (`DEBT-18` agreements and orientation not required for activation; `DEBT-19` institution-admin affiliation endpoints deferred by D-56) — verify `grep -n DEBT-1 docs/known-debt.md` lists both with an owner and a target
- [x] 7.3 Update `docs/mvp-build-plan.md` §5 row #5, `docs/milestones-and-phases.md` Current state, and `docs/local-setup.md` (the placeholder domain and the seed command) — verify the stated commands run as written against the local stack

## 8. Integration checks

- [x] 8.1 Run `CI=true pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and report the per-package counts — verify 0 failures, 0 skipped, and the total above today's 230
- [x] 8.2 Claim once against the running stack as a seeded account and read the affiliation back from `GET /v1/me` — verify the live response, and confirm the `connect` dev database change is reported to the owner
- [x] 8.3 Run the review gate (`verify-before-done`, `/ponytail-review`, `/ce-code-review`, `silent-failure-hunter`, trust-rule check, `/ponytail-debt`) and record the findings — verify every finding is either fixed in scope or reported as debt

## Workflow follow-up

- Archive the change after the owner approves the review, then verify the archive and the merge.
