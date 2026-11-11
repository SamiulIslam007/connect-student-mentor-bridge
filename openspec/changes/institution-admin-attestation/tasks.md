# Tasks: institution-admin-attestation

## 0. Preconditions

- [ ] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1`, `git status`, `grep -n "institutionId" services/api/src/db/schema/roles.ts`, `grep -n "decided_by_user_id\|decision_reason" services/api/src/db/schema/affiliations.ts`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff.
- [ ] 0.2 Confirm with the owner that `AGENTS.md` rule 12 is amended in this change (design D8 open question). Verify: the answer is recorded in this file before the seed task starts; if refused, the seed writes only the institution admin and the platform admin stays a documented hand-run `INSERT`.

## 1. Identity: a role grant that carries an institution

- [ ] 1.1 Extend `GrantRoleInput` in `packages/domain/src/identity.ts` with an optional `institutionId`, and pass it through `grantRole` in `services/api/src/identity/better-auth-identity.service.ts` so an `INSTITUTION_ADMIN` row satisfies `role_assignments_institution_required`; keep the existing idempotent `onConflictDoNothing` and the audit-on-insert-only behaviour. Verify: `services/api/test/identity.integration.test.ts` asserts one active row with the institution, a second identical grant writing no second row and no second audit entry, and an `INSTITUTION_ADMIN` grant without an institution still failing at the database constraint.
- [ ] 1.2 Add `listInstitutionAdminScopes(userId)` to `IdentityService` and its implementation, returning an array of the institution ids of active `INSTITUTION_ADMIN` rows, ordered by institution id for a stable wire shape. Verify: the same integration file asserts one scope after a grant for one institution, two after a second grant, and an empty list for an account with no such role.

## 2. The scoped authorization helper

- [ ] 2.1 Add `requireInstitutionAdmin(identity, request)` to `services/api/src/authorization/authorize.ts`, built on `actingAccountWithRoles`, refusing with `ROLE_REQUIRED` when the caller holds no `INSTITUTION_ADMIN` scope and with `MFA_REQUIRED` when no second factor is enrolled, and returning `{ account, roles, institutionIds }`. Verify: a unit or integration test drives all three outcomes, and `pnpm --filter api typecheck` lists every consumer.

## 3. The queue and the decision

- [ ] 3.1 Add `services/api/src/institutions/` (`institutions.module.ts`, `attestation.controller.ts`, `attestation.service.ts`, `attestation.tokens.ts`, `drizzle-attestation.service.ts`) and register the module in `services/api/src/app.module.ts`. Verify: `pnpm --filter api typecheck` passes and the integration stack resolves the module.
- [ ] 3.2 Implement `listPendingClaims(institutionIds)`: `status = 'PENDING'` and `institution_id` in the caller's scope, excluding null institutions, ordered by claim id for a stable page, with the projection from `design.md` D12 (email domain only, via `split_part`, never the local part). Verify: an integration test asserts two institutions with two admins see only their own rows, that a decided claim is absent, that an organization-only claim is absent, and that the entry's key set is exactly the documented one.
- [ ] 3.3 Implement `decideClaim({ claimId, actorUserId, institutionIds, decision, reason, requestId })` as one transaction: refuse `FORBIDDEN` when the claim's account is the actor; refuse `404` when the claim is absent or outside the scope; refuse `422 VALIDATION_ERROR` when `reason` is empty or over the field limit; update only `WHERE id = ... AND status = 'PENDING'`; on verification revoke any other `VERIFIED` row for that account, then write `status`, `level` level 1, `method` admin attestation, `decided_by_user_id`, `decision_reason`, `verified_at`; append one `AFFILIATION_GRANTED` or `AFFILIATION_REJECTED` audit entry with no email in metadata; queue one `affiliation-decided` outbox row; and call `syncMentorActivation` on verification. Verify: an integration test asserts each refusal code, the successful verification's stored columns, the single revoked earlier row, the single audit entry, the single queued email filtered on the payload's template field, and the `409` when the update matches no pending row.
- [ ] 3.4 Add the two routes to `attestation.controller.ts`: `GET /v1/institution/affiliations` and `POST /v1/institution/affiliations/:id/decide`, both behind `requireInstitutionAdmin`, the write decorated with `@Throttle({ default: RATE_LIMITS.write })`, the claim id validated as a uuid. Verify: an integration test asserts `401` with no session, `403` for a mentor, `403` for an institution admin without a second factor, and `422` for a malformed id.
- [ ] 3.5 Add `AFFILIATION_REJECTED` to `AuditAction` in `services/api/src/identity/audit-log.ts` and `affiliation-decided` to `EmailTemplate` in `services/api/src/email/email-sender.ts`, with the template body carrying the institution name and the decision only. Verify: the compiler names every consumer; a test asserts the queued payload's template name and that its text contains no reviewer identity and no email local part.

## 4. The grant route

- [ ] 4.1 Add `POST /v1/admin/institutions/:id/admins` to `attestation.controller.ts` (or a small admin controller in the same module), behind `requireRole(identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, resolving the target account by email and refusing `422` for an unknown email, `404` for an unknown institution, and delegating to `grantRole` with the institution. Verify: an integration test asserts the stored row, the single audit entry, the idempotent repeat, `403` for an institution admin caller, and `422` for an unknown email.

## 5. Contracts and the three registries

- [ ] 5.1 Add the three paths to `packages/contracts/openapi.yaml`: the queue read with its `200` array schema and its `401`/`403`/`404` problems, the decision write with `decision` and `reason` and its `200`/`401`/`403`/`404`/`409`/`422` problems, and the grant write with `email` and its `200`/`401`/`403`/`404`/`422` problems. Verify: `pnpm --filter @connect/contracts test` passes, including the body-key parity test.
- [ ] 5.2 Add the two body-bearing routes to `packages/contracts/src/body-keys.ts`: `POST /v1/institution/affiliations/:id/decide` with `decision` and `reason`, and `POST /v1/admin/institutions/:id/admins` with `email`. The list route takes no body and gets no entry. Verify: `pnpm --filter @connect/contracts test` passes and `grep -n "institution" packages/contracts/src/body-keys.ts` shows exactly those two lines.
- [ ] 5.3 Add the three `MATRIX` rows to `services/api/test/authorization-matrix.test.ts` and add `AttestationController` plus its provider tokens to that file's controller and provider lists. Verify: the matrix test passes and reports the queue and decision as institution-admin plus MFA, and the grant as platform-admin plus MFA.
- [ ] 5.4 Add `AttestationController` and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: the file passes with no "allowlisted without a route" and no "route without an allowlist".

## 6. The web surface

- [ ] 6.1 Add `apps/web/lib/attestations.ts`: payload types, a formatter for the claim line (display name, domain, department, program, batch year), and the decision-body builder. Verify: `apps/web/test/attestations.test.ts` asserts the mapping, the empty queue, and that the body builder refuses an empty reason before a request is made.
- [ ] 6.2 Add the two BFF routes under `apps/web/app/api/institution/attestations/` by copying the nearest read-only and write routes and replacing only the upstream path and depth (count the `../` segments for the nested decide route); never hand-write an Authorization header. Verify: route tests assert the forwarding, a status passthrough including `409`, and a non-JSON upstream mapping to `502`.
- [ ] 6.3 Add `apps/web/app/institution/attestations/page.tsx` with the queue, a per-claim verify and reject action behind a required reason field, loading, empty, error and success states, and the refusal path shown as an error rather than a crash. Verify: a page test reads the file and asserts the fetch calls, the required reason field, and the empty and error strings, following the existing page-test pattern that never renders.
- [ ] 6.4 Add the `attestations` group to `apps/web/lib/strings.ts` and the `/institution/attestations` navigation entry to `apps/web/lib/navigation.ts`, shown only when `roles` contains `INSTITUTION_ADMIN`. Verify: `apps/web/test/navigation.test.ts` asserts the entry for that role, its absence for `MENTOR`, and that signed-out navigation is unchanged.

## 7. Seed and the standing rule it needs

- [ ] 7.1 Extend `services/api/src/db/seed/` to create one platform admin and one institution admin on the reserved example domain, with an `INSTITUTION_ADMIN` row carrying the seeded institution, idempotent by email, and refuse to run when `NODE_ENV=production`. Verify: a second run inserts nothing; a test asserts the production refusal.
- [ ] 7.2 Amend `AGENTS.md` rule 12 so it names the seed as a sanctioned grant path for the demo accounts while keeping the hand-run `INSERT` as the pilot path, and record the amendment in the change's decision rows (D-103). Verify: `grep -n "PLATFORM_ADMIN" AGENTS.md` reads the amended rule, and the diff shows no other rule weakened.
- [ ] 7.3 Update `docs/local-setup.md` so the local checklist names the seeded admin emails and where their passwords come from, without printing a secret. Verify: the checklist step runs as written on a fresh database.

## 8. Docs and decisions

- [ ] 8.1 Update `docs/api-contracts.md` section 5.2 with the three paths, their access, their bodies, their refusal codes and the queue projection. Verify: the section no longer says a pending claim has no approve path.
- [ ] 8.2 Update `docs/auth-and-access-control.md` with the institution-admin scope rule, the MFA requirement, the self-decision refusal and the grant route. Verify: `grep -rn "no admin route\|D-56" docs/auth-and-access-control.md` no longer states the opposite.
- [ ] 8.3 Update `docs/functional-requirements.md` marking `FR-VER-02` built with its evidence line, and `docs/data-model.md` noting that `ADMIN_ATTESTATION` is now written by a decision as well as by the seed. Verify: both files name this change and the date.
- [ ] 8.4 Update `docs/known-debt.md`: close `DEBT-19` and `DEBT-35` with their evidence, and add one row for bootstrapping the first platform admin in production. Verify: each closed row names the test that proves it.
- [ ] 8.5 Add the decision rows `D-97` to `D-103` (full text at the end of this file) to `docs/decision-log.md`, and correct any doc that still says attestation is seed-only. Verify: `grep -rn "seed row is auditable\|no admin route" docs/` returns nothing that contradicts the implemented behaviour.
- [ ] 8.6 Update `docs/mvp-build-plan.md` section 5 (a row for this change), `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three docs agree on the status, the PR number and the date.

## 9. Full checks, review and handoff

- [ ] 9.1 Run from the repo root with Docker up: `pnpm lint`, `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run; a run with many skipped files and zero failures is UNVERIFIED, not a pass. The api suite replays the migrations for every integration file and takes ten minutes or more, so run the four gates as one background job writing to a log file and read it back.
- [ ] 9.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. This change touches authorization and verification, which section 2 lists as high-risk, so run `/ponytail-audit` as well.
- [ ] 9.3 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the per-package gate totals, the `AGENTS.md` rule-12 amendment, the seeded account emails, and anything left as debt.

## Decision rows to add at apply

Add each of these to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-97**

- Date: 2026-11-11
- Decision: The dev seed creates one platform admin and one institution admin on the reserved example domain, and a platform-admin route grants `INSTITUTION_ADMIN` for a named account and one institution. Both paths are idempotent, and the seed refuses to run outside development.
- Reason: a grant needs a first actor and a redeploy per grant is what DEBT-19 records; the seed breaks the loop once and the route removes the redeploy.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/local-setup.md`, `docs/known-debt.md` (DEBT-19 and DEBT-35 closed, one new row)

**D-98**

- Date: 2026-11-11
- Decision: Institution routes use one helper, `requireInstitutionAdmin(identity, request)`, which returns the account, its roles and the institution ids it administers, and requires an enrolled second factor. `IdentityService` gains `listInstitutionAdminScopes(userId)` so role data stays inside the identity module.
- Reason: one place decides the scope rule, and the role is read from the database on every request as every other route does.
- Status: Decided
- Affects: `services/api/src/authorization/authorize.ts`, `packages/domain/src/identity.ts`, `docs/auth-and-access-control.md`

**D-99**

- Date: 2026-11-11
- Decision: Verification sets `status` verified, `level` level 1, `method` admin attestation, `decided_by_user_id`, `decision_reason` and `verified_at`, revokes any other verified affiliation of the same account in the same transaction, appends one audit entry, queues one notice, and re-runs the mentor activation sync. Rejection sets `status` rejected with a required reason and grants no level.
- Reason: the partial unique index makes the revocation mandatory rather than optional, and a mentor must not stay pending after being verified.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/data-model.md`, `docs/api-contracts.md` section 5.2

**D-100**

- Date: 2026-11-11
- Decision: The institution surface is `GET /v1/institution/affiliations` and `POST /v1/institution/affiliations/{id}/decide` with `decision` and a required `reason`. The single `/v1/admin` addition is `POST /v1/admin/institutions/{id}/admins`, whose body names the target by `email`.
- Reason: the actor owns the path name, and an admin can discover an email but not an account id.
- Status: Decided
- Affects: `packages/contracts/openapi.yaml`, `packages/contracts/src/body-keys.ts`, `docs/api-contracts.md` section 5.2

**D-101**

- Date: 2026-11-11
- Decision: A queue entry carries the claim id, the applicant's display name, the applicant's email domain only, the claim kind, department, program, batch year and the claim timestamp. No biography, goals, availability or capacity is exposed.
- Reason: FR-PROF-04 keeps a student's profile from an institution admin without consent, and an attestation does not need it.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/auth-and-access-control.md`

**D-102**

- Date: 2026-11-11
- Decision: A decision updates only a row whose status is pending, and a zero-row match answers `409 CLAIM_ALREADY_DECIDED` with no audit entry and no email. A claim created by the acting account is refused with `403 FORBIDDEN` before any write.
- Reason: a conditional update removes the two-reviewer race, and self-decision has no legitimate reading.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/api-contracts.md` section 5.2

**D-103**

- Date: 2026-11-11
- Decision: `AGENTS.md` rule 12 is amended so the checked-in seed is a sanctioned grant path for the demo platform and institution admins, while the hand-run `INSERT` in `docs/local-setup.md` stays the pilot path. No route grants `PLATFORM_ADMIN`.
- Reason: the rule and the new seed would otherwise contradict each other in the same commit, and a rule that is quietly broken is worse than a rule that is explicitly narrowed.
- Status: Decided
- Affects: `AGENTS.md`, `docs/local-setup.md`, `services/api/src/db/seed/`

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive the change on its own `chore/archive-institution-admin-attestation` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the MODIFIED requirement replaced the archived text in full (its header kept, its single scenario rewritten, nothing dropped) and that `openspec validate --all --strict` still passes.
