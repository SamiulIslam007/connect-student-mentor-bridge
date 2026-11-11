# Design: institution-admin-attestation

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `a7aba38`, clean; no active change; `openspec validate --all --strict` reports 37 passed, 0 failed once all three of this round's change directories exist (34 specs plus three changes). CI run `42804468000` on `main` is green. No gate was run in this propose round.
- `openspec/specs/institutions/affiliation-verification/spec.md` ends with the requirement "No admin decision surface exists in this release" whose scenario "No approve path" asserts `404`. Nothing else in that spec speaks about approval, so exactly one requirement block changes.
- `affiliations` (`services/api/src/db/schema/affiliations.ts`) already has `decided_by_user_id`, `decision_reason`, `verified_at`, `revoked_at`, `expires_at`, `level`, `method`, `status`, and a partial unique index `affiliations_one_verified_unique` on `user_id WHERE status = 'VERIFIED'`. `institution_id` is nullable and a check requires either it or `organization_name`.
- `role_assignments` (`services/api/src/db/schema/roles.ts`) already has `institution_id`, the active-row unique index folding a missing institution to a sentinel, and `role_assignments_institution_required` (`role = 'INSTITUTION_ADMIN'` requires an institution). No migration is needed for either table.
- `IdentityService.grantRole` (`packages/domain/src/identity.ts`, implemented at `services/api/src/identity/better-auth-identity.service.ts`) takes `userId`, `role`, `actorUserId`, `requestId` and writes the `ROLE_GRANTED` audit entry itself. It has no institution parameter, and `listRoles(userId)` returns a role list with no scope.
- `requireRole` (`services/api/src/authorization/authorize.ts`) reads roles from the database on every request and optionally enforces an enrolled second factor; it knows nothing about institutions.
- The claim transaction (`drizzle-affiliations.service.ts`) revokes every `VERIFIED` row for the account before inserting a new claim, then calls `syncMentorActivation(tx, userId)` (`services/api/src/onboarding/mentor-activation.ts`). A stale `PENDING` row at another institution can therefore coexist with a later `VERIFIED` row.
- `AuditAction` (`services/api/src/identity/audit-log.ts`) is a closed union with `AFFILIATION_GRANTED`, `AFFILIATION_REVOKED` and `ROLE_GRANTED`; there is no rejection action. `appendAuditEntry` documents that metadata must never hold a raw email address.
- `EmailTemplate` (`services/api/src/email/email-sender.ts`) is a closed union of 17 templates with no affiliation template.
- `apps/web/lib/navigation.ts` already gates `/admin/reviews` and `/admin/reports` on the `PLATFORM_ADMIN` role, and `apps/web/app/session-nav.tsx` reads `roles` from `GET /api/me`, which `me.controller.ts:53` fills from `listRoles`.
- The seed (`services/api/src/db/seed/`) writes institutions, domains and attestation affiliations for listed accounts, and creates no privileged role for any account.
- `AGENTS.md` rule 12 states that the pilot's `PLATFORM_ADMIN` role is granted by a hand-run `INSERT` in `docs/local-setup.md`, never by a script or route.

## Goals / Non-Goals

**Goals**

- One scoped authorization helper that every institution route uses, so the scope rule is decided in one place.
- A decision that is one transaction with its audit entry, its queued notice, and the activation sync, mirroring the claim path.
- An environment where both existing admin pages are reachable without hand-written SQL, for the demo and the pilot.

**Non-Goals**

- No institution onboarding, no domain management, no aggregates.
- No revocation, expiry, or re-verification of an already verified affiliation.
- No new table, column, or enum value; no migration.

## Decisions

Owner decisions keep the numbers the brief fixed (D8 to D13). Decisions taken while writing this proposal carry `R` numbers, because D14 to D16 are the third change in the same round.

### D8. Both a seed and a grant route (owner decision, decision-log D-97)

The dev seed creates one platform admin and one institution admin, and a platform-admin route grants `INSTITUTION_ADMIN` for the rest. The seed breaks the chicken-and-egg (a grant needs an actor), the route removes the redeploy DEBT-19 complains about. Alternatives rejected: seed only (the redeploy per grant stays); route only (no first actor exists, and the reviewer would bootstrap with hand-written SQL).

**Conflict recorded, not silently resolved:** `AGENTS.md` rule 12 says the platform-admin role is granted by a hand-run `INSERT`, never by a script or route. Seeding a `PLATFORM_ADMIN` is a script granting that role, so rule 12 must be amended in the same commit (decision row D-103) and the owner approves it at review. The narrower alternative, if the owner prefers, is to seed only the institution admin with a null granter, which the schema already permits as a system grant, and leave the platform admin to the documented `INSERT`. Both options fit this change without altering the spec deltas.

### D9. One scoped helper in `authorize.ts` (owner decision, decision-log D-98)

`requireInstitutionAdmin(identity, request)` returns the acting account plus the institution ids the caller actively administers, and refuses with `ROLE_REQUIRED` or `MFA_REQUIRED`. It is built on `actingAccountWithRoles` so the role is read from the database on every request. Alternative rejected: checking the scope inside each service, which would put the same rule in two services and a third time in the controller.

**Implementation note:** `listRoles` returns no scope, so `IdentityService` gains one read, `listInstitutionAdminScopes(userId)` returning an array of institution ids, covering the active `INSTITUTION_ADMIN` rows. That is the smallest addition that keeps role reads inside the identity module, which is where every other role read lives. Alternative rejected: querying `role_assignments` from the institutions service, which would make a second module own role data.

### D10. Verification writes the full attestation record (owner decision, decision-log D-99)

`status` verified, `level` level 1, `method` admin attestation, `decided_by_user_id`, `decision_reason`, `verified_at`. Rejection writes `status` rejected and the reason and no level.

**Forced by the schema, not a choice:** the verification transaction must revoke any other `VERIFIED` row for that account before the update, because `affiliations_one_verified_unique` would otherwise refuse the write with a database error rather than a problem response. The claim path already does exactly this, and the archived requirement "A reconfigured affiliation suspends Level 1 until re-verified" describes the resulting state. The transaction also calls `syncMentorActivation`, without which a mentor with a second factor would stay `PENDING` until some unrelated write touched the profile.

### D11. Three routes, and the grant route is the only `/v1/admin` addition (owner decision, decision-log D-100)

`GET /v1/institution/affiliations`, `POST /v1/institution/affiliations/{id}/decide`, and `POST /v1/admin/institutions/{id}/admins`. The decision body is `decision` (`verify` or `reject`) plus a required `reason`. The grant body names the target by `email` only.

Alternatives rejected: `/v1/admin/affiliations` for the queue, which misnames the actor; naming the target by `user_id`, which no admin can discover from the product; and a `PUT` on the claim, which reads as an edit of applicant data rather than a decision.

### D12. The reviewer sees the claim, not the profile (owner decision, decision-log D-101)

A queue entry carries the claim id, display name, email domain only (computed with `split_part(email, '@', 2)` in SQL, so the local part never leaves the database), kind, department, program, batch year and the claim timestamp. Alternative rejected: including biography or goals, which `FR-PROF-04` keeps from an institution admin without the student's consent.

### D13. One decision per claim, conditional on the pending status (owner decision, decision-log D-102)

The update is `... WHERE id = ... AND status = 'PENDING'` inside the transaction; a zero-row match returns `409 CLAIM_ALREADY_DECIDED` and writes nothing else. Alternative rejected: read-then-write with a status check, which is the race the conditional update removes.

### R1. The self-decision refusal is its own refusal, not a scope miss

A claim created by the acting account is refused with `FORBIDDEN` before the row is touched, so the response is not a misleading `404`. It is also checked before the audit write, so a refuse leaves no trace other than the request log.

### R2. Audit actions and the email template are two closed unions that must grow

Add `AFFILIATION_REJECTED` to `AuditAction` and use the existing `AFFILIATION_GRANTED` for verification, with `metadata` carrying level, method and status and never the applicant's email. Add one `EmailTemplate`, `affiliation-decided`, carrying the institution name and the decision, and no reviewer identity. Alternatives rejected: reusing `AFFILIATION_GRANTED` for a rejection (the action's name would lie in the audit trail) and reusing `account-suspended` (wrong recipient facts).

### R3. Rate limiting uses the existing write bucket

Both write routes take `RATE_LIMITS.write` (60 per minute), as the report-resolution route does. The queue read takes the default bucket.

### R4. Navigation is role-gated on the client, authorization on the server

`navLinks` gains an `/institution/attestations` entry when `roles` contains `INSTITUTION_ADMIN`, following the existing `PLATFORM_ADMIN` block. The page itself handles a refusal response by showing the error state, because hiding a link is convenience and never authorization.

## Acceptance criteria

Six criteria from the exploration report plus the self-decision refusal:

1. An institution admin for institution A reads a queue with every pending claim of A and no claim of B, and a claim id belonging to B answers `404` rather than `403`.
2. Verifying a pending claim stores `status` verified, level 1, method admin attestation, the deciding account, the reason and a verification timestamp, writes one audit entry, queues exactly one notice, and revokes any other verified affiliation of that account in the same transaction.
3. Rejecting requires a reason (`422` without one), grants no level, and writes one audit entry and one notice.
4. A second decision on the same claim answers `409 CLAIM_ALREADY_DECIDED` and changes nothing.
5. A platform admin with an enrolled second factor grants `INSTITUTION_ADMIN` for one named institution, the seeded institution admin can then open `/institution/attestations`, and a caller without the role answers `403 ROLE_REQUIRED`.
6. No queue entry carries a biography, a goal, an availability window, a capacity number, or the applicant's email local part.
7. An institution admin cannot decide their own claim: the response is `403 FORBIDDEN`, the claim stays `PENDING`, and no audit entry is written.

## Assumptions

1. One institution admin may administer more than one institution, so the helper returns a list and the queue spans all of them.
2. The applicant's display name is acceptable to an institution admin; the archived visibility policy lets an institution admin see aggregates only, so this is a narrow, explicit exception the owner approved as D12, and it is stated in the delta's projection requirement.
3. `syncMentorActivation` is idempotent and safe to call inside the decision transaction, which the claim path already relies on.
4. The seed accounts are demo-grade fixtures under the reserved example domain, as the existing demo mentors are.

## Risks / Trade-offs

- A seeded platform admin is a standing privileged account in a dev database. Mitigation: it uses the reserved example domain, it is created only by the ordinary seed entry point, and `docs/local-setup.md` records the credentials it prints; nothing seeds it when `NODE_ENV=production`.
- The MODIFIED block keeps a header that is now historical ("No admin decision surface exists in this release"). Mitigation: the design records it, the report names it, and the requirement's text is rewritten to the truth; renaming the requirement would mean `REMOVED` plus `ADDED`, which the owner did not choose.
- A new `IdentityService` method touches a wide interface. Mitigation: one method with one implementation and one integration assertion, and the compiler names every fake that must satisfy it.
- The activation sync inside the decision could surprise a reviewer who verifies before the mentor has a second factor. Mitigation: the response reports the decided claim and the queue test asserts the mentor's status only in the case where the factor exists.

## Open Questions

- The `AGENTS.md` rule 12 amendment (D8). The owner approves it at proposal review; if refused, the seed task drops the platform admin and keeps the institution admin as a system grant.
- Whether a rejected applicant should be able to resubmit the same institution immediately. This design allows it (the claim path treats a `REJECTED` row as not existing, so a new pending row is created), and no rate limit is added beyond the existing claim throttle.

## Migration Plan

None. No schema change and no backfill. Deploy order: the identity read and the `grantRole` scope first, then the institutions module, then the web surface; a client that never opens the page is unaffected. Rollback is the revert of the commit plus deleting the two seeded accounts by email if a database was already seeded.
