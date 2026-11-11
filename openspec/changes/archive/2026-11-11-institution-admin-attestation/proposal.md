# Proposal: institution-admin-attestation

## Why

`FR-VER-02` is Must and unbuilt, and `DEBT-19` and `DEBT-35` record the consequence in the owner's own words: an affiliation claim whose email domain is not registered stays `PENDING` forever, so a mentor without an institutional address "cannot be verified without a code change and a redeploy". `D-56` made attestation a checked-in seed edit to avoid building a surface twice. There is also no way to hold the role that would use such a surface: registration grants `STUDENT`, `POST /v1/me/roles/mentor` grants `MENTOR`, the demo seed grants `MENTOR`, and `grep -rn "INSTITUTION_ADMIN" services/api/src` finds only the enum and its constraint — so the two admin pages that already exist are unreachable for any real account.

## What Changes

- Add `requireInstitutionAdmin(identity, request)` to `services/api/src/authorization/authorize.ts`, returning the acting account plus the institution ids the caller administers, and requiring an enrolled second factor.
- Add `GET /v1/institution/affiliations`: the pending claim queue for the caller's institutions only.
- Add `POST /v1/institution/affiliations/{id}/decide`: one decision per claim, `verify` or `reject`, with a required reason. Verification sets `status = VERIFIED`, `level = LEVEL_1`, `method = ADMIN_ATTESTATION`, `decided_by_user_id`, `decision_reason` and `verified_at`, appends one audit entry, queues one notice email, and re-runs the mentor activation sync. Rejection sets `status = REJECTED` with the reason and grants no level.
- Add `POST /v1/admin/institutions/{id}/admins`: a platform admin with an enrolled second factor grants `INSTITUTION_ADMIN` for one institution to a named account by email, writing one `role_assignments` row and one `ROLE_GRANTED` audit entry.
- Extend `GrantRoleInput` with an optional `institutionId`, because `role_assignments_institution_required` refuses an `INSTITUTION_ADMIN` row without one.
- Extend the checked-in seed so a fresh environment has one platform admin and one institution admin, so the two admin pages stop being unreachable. This needs `AGENTS.md` rule 12 amended in the same commit, because that rule currently says the platform-admin role is granted only by a hand-run `INSERT`.
- Add `/institution/attestations` and its two BFF routes, a navigation entry for the role, the string catalog entries, and a pure helper with its test.
- Modify the `institutions/affiliation-verification` requirement that says no admin decision surface exists, and add the queue, decision, grant and scope requirements to the same capability.
- Close `DEBT-19` and `DEBT-35`. Add a debt row for bootstrapping the first platform admin in production.
- No migration: `affiliations` already carries every column this needs and `role_assignments` already enforces its institution constraint.

## Capabilities

### New Capabilities

None. The behaviour belongs to the capability that already owns affiliation verification.

### Modified Capabilities

- `institutions/affiliation-verification`: the requirement titled "No admin decision surface exists in this release" is replaced by the rule that approval is available only to an institution admin and refused to everyone else; new requirements are added for the queue, the decision, the grant and the scope rules. The seed-attestation requirement stays true and is not touched.

## Impact

- **Code**: `services/api/src/authorization/authorize.ts` (the scoped helper), `packages/domain/src/identity.ts` (`GrantRoleInput.institutionId`, one new error code if needed), `services/api/src/identity/better-auth-identity.service.ts` (`grantRole` writes the scope; one new read of institution-scoped assignments), `services/api/src/institutions/` (module, controller, service interface, tokens, Drizzle service), `services/api/src/app.module.ts`, `services/api/src/affiliations/` (the decision transaction reuses `syncMentorActivation` and `appendAuditEntry`), `services/api/src/identity/audit-log.ts` (one action), `services/api/src/email/email-sender.ts` (one template), `services/api/src/db/seed/` (the two admin accounts), `apps/web/app/institution/attestations/page.tsx`, `apps/web/app/api/institution/attestations/` (two routes), `apps/web/lib/attestations.ts`, `apps/web/lib/navigation.ts`, `apps/web/lib/strings.ts`.
- **Tests**: new `services/api/test/attestation.integration.test.ts`, `apps/web/test/attestations.test.ts`; edited `services/api/test/authorization-matrix.test.ts` (three MATRIX rows plus the controller and provider lists), `services/api/test/request-validation.integration.test.ts` (controller and provider lists), `services/api/test/identity.integration.test.ts` (the scoped `grantRole` write), `services/api/test/database.integration.test.ts` only if a table appears (it does not).
- **API/contract**: `packages/contracts/openapi.yaml` gains three paths; `packages/contracts/src/body-keys.ts` gains `POST /v1/institution/affiliations/:id/decide` with `decision` and `reason`, and `POST /v1/admin/institutions/:id/admins` with `email`. The list route takes no body and gets no entry.
- **Data**: none. No table, column, enum or migration. The decision updates existing `affiliations` columns; the grant inserts one `role_assignments` row that the existing constraint already validates.
- **Dependencies**: none added.
- **Docs**: `docs/api-contracts.md` section 5.2 (three paths), `docs/auth-and-access-control.md` (the institution-admin surface, its scope rule and its MFA requirement), `docs/functional-requirements.md` (`FR-VER-02` built), `docs/known-debt.md` (DEBT-19 and DEBT-35 closed, one new row), `docs/decision-log.md` (the decisions this change records), `docs/data-model.md` (the attestation columns are already described; note the `ADMIN_ATTESTATION` decision path), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line, `docs/local-setup.md` if the seed accounts change the local checklist.

## Depends on

- `institutions/affiliation-verification` (archived 2026-11-08): the claim row, `resolveAffiliationClaim`, the one-verified-per-account index, and the seed attestation path.
- `identity/role-authorization` (archived 2026-11-05): `role_assignments`, the role guard, and the `requiresMfa` option this helper reuses.
- `identity/account-status-lifecycle` and `identity/mfa-totp` (archived): the second factor the helper requires.
- `profiles/mentor-onboarding` (archived 2026-11-08): `syncMentorActivation`, which must run inside the verification transaction so a mentor without a registered domain becomes `ACTIVE` immediately.
- `platform/outbox-and-job-runner` (archived 2026-11-08): the queued notice email.
- `trust/abuse-reports-and-sanctions` (archived 2026-11-10): the admin-write pattern this change follows (reason required, one transaction, one audit entry, one queued notice, MFA).

## Out of scope

- Institution onboarding (`FR-INST-01`): creating an institution, registering its domains, recording an MoU date, or assigning admins in bulk.
- Institution dashboards and aggregates (`FR-INST-02`, `FR-INST-03`).
- Revoking a verified affiliation, expiring one, or re-running verification on a profile edit.
- Bulk decisions, case assignment, due dates, SLAs, or an attestation history view.
- Bootstrapping the first platform admin in production, which has no server-side path and is recorded as debt.
- Any change to the claim endpoint, the seed attestation path, or the domain-match rule.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An institution admin verifies an affiliation they should not see | The queue is scoped to the caller's institution ids, a claim id outside that scope answers `404`, and the applicant's profile text is never in the payload |
| A second decision silently overwrites the first | The update is conditional on `status = PENDING` and a zero-row match answers `409 CLAIM_ALREADY_DECIDED` |
| The partial unique index refuses the verification with a `500` | The verification transaction revokes any other `VERIFIED` row for that account first, exactly as the claim path does, so at most one row is `VERIFIED` |
| The grant route becomes a privilege-escalation path | It requires `PLATFORM_ADMIN` plus an enrolled second factor, it writes one role for one institution, and the audit entry names the actor; a self-grant of `PLATFORM_ADMIN` remains impossible because no route grants that role |
| Seeding a platform admin contradicts `AGENTS.md` rule 12 | The rule is amended in the same commit as the seed, and the change is named in the handoff as an owner-approved exception; the alternative is seeding only the institution admin and leaving the platform admin to the documented `INSERT` |
| An institution admin decides their own claim | The decision route refuses when the claim's account is the acting account, with its own test |
| A mentor becomes `ACTIVE` in the same transaction and the notice fails | The notice is an outbox row written in the transaction; a delivery failure retries and never rolls back the verification |

Rollback: delete the institutions module and the web surface, revert the contract, the helper, the `grantRole` signature and the seed. Verification rows written before a rollback stay `VERIFIED` with `method = ADMIN_ATTESTATION`, which is a legal state the archived spec already describes as the seed outcome, so no data repair is needed.

**Traces to** FR-VER-02 (institution-admin attestation queue), FR-VER-04 (a mentor below Level 1 cannot receive requests; verification here is what lifts it), FR-AUTH-07 (object-level authorization on every endpoint), FR-AUD-01 (audit of verification and admin actions), FR-NOT-01 (one queued email per state change), FR-PROF-04 (an institution admin sees no student profile text without consent); ADR-008 (append-only audit), ADR-018 (Drizzle); D-56 (attestation was seed-only), D-48 and D-49 (admin session rules this change does not touch), the report-queue decisions D-87 to D-90 (the admin-write pattern followed here); DEBT-19 and DEBT-35 (closed).
