# Design

## Repository snapshot (verified 2026-11-08, re-check at apply)

- `main` is at `32ec974`; the working tree is clean; `openspec list` reports no active changes and `openspec validate --all --strict` passes 20 specs.
- Gates on this machine, `CI=true pnpm test`: **230 tests, 230 pass, 0 fail, 0 skipped** (api 113, web 59, domain 47, contracts 11); `pnpm lint`, `pnpm typecheck`, `pnpm build` green. The stack is up and healthy on `:3000`/`:3001`.
- `mentor_profiles` columns today: `id`, `user_id`, `primary_field_id`, `status` (`DRAFT` default, never transitioned by any code path), `headline`, `bio`, `expertise_summary`, `scope_statement`, `languages`, `weekly_capacity` (check `>= 1`), `access_mode`, timestamps. There is **no** `onboarding_status` and no `activated_at`.
- Tables today: `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `consent_records`, `audit_logs`, `signup_blocks`, `institutions`, `institution_domains`, `role_assignments`, `fields`, `student_profiles`, `mentor_profiles`, `mentor_fields`, `student_field_interests`, `availability_windows`. **No `affiliations`.**
- `consent_purpose` enum: `TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`. Registration writes `TERMS` and `PRIVACY_NOTICE` only (`better-auth-identity.service.ts`), so no agreement consent has ever been written.
- Migrations `0000`–`0008` in `services/api/drizzle/`; app-role grants are hand-written per migration, and `database.integration.test.ts` probes them under `SET ROLE connect_app`.
- `services/api/src/db/seed/institutions.ts` holds `INSTITUTION_SEED` with two illustrative rows (domains `illustrative-university.example`, `illustrative-training.example`); `run.ts` is the only seed entry point.
- `services/api/src/authorization/authorize.ts` provides the role guard and `requiresMfa`; `services/api/test/authorization-matrix.test.ts` fails when a registered route is missing from its table.
- `GET /v1/me` already returns `mfa_enabled`, `roles`, `student_profile`, `mentor_profile`; `apps/web/app/profile/page.tsx` is the signed-in profile editor and `apps/web/lib/strings.ts` is the string catalog.

## Goals / Non-Goals

**Goals:** one claim path with a Level 1 rule that cannot be gamed by an unverified address; a stored operating status that later changes can filter on; usable pilot data with no admin surface.

**Non-Goals:** building the discovery gate, the request gate, or the admin decision surface. Nothing in this change reads the new status to authorise an action.

## Decisions

**D1 — `affiliations` with a partial unique index for one verified affiliation per account.**
`affiliations` carries the canonical columns from `data-model.md` §5.1 plus a partial unique index on (`user_id`) `WHERE status = 'VERIFIED'`.
*Rejected:* multiple simultaneous verified affiliations (the pilot has one institution and Level 1 is a single fact; two rows would make "the" level ambiguous); no index at all (a double claim could grant two Level 1 rows and double the entitlement in later aggregation).

**D2 — The institution comes from the verified account email, not from a picker.**
`POST /v1/me/affiliations` accepts `institution_id?`, `kind`, and the optional `department`/`program`/`batch_year`; the level is decided by the caller's verified email domain against `institution_domains`.
*Rejected:* a `GET /v1/institutions` list plus a select control (an extra endpoint whose only use is choosing an institution the email cannot support, which stores `PENDING` either way); a second email-verification token (better-auth already owns email verification, and a second token is a second truth).

**D3 — Operating status is stored, not derived on read.**
One exported `syncMentorActivation(userId)` is called from the claim path, the second-factor enrolment path, and the mentor-role grant; it writes `status`, `onboarding_status`, and `activated_at`.
*Rejected:* computing status in `GET /v1/me` only (#7 must filter requestable mentors in SQL and an unqueryable status turns into an in-memory scan); writing status independently at each call site (three copies of the rule drift, and the reason malformed mentors are possible today is exactly that).

**D4 — Pilot attribution is seeded (D-56).**
`services/api/src/db/seed/affiliations.ts` holds a checked-in list of `{ email, institution, kind, reason }` and writes `VERIFIED`/`ADMIN_ATTESTATION` rows; an unknown email is reported as skipped, not fatal. The seed also adds `example.edu.bd` (D-57) to the illustrative institution so the automatic path is exercisable locally.
*Rejected:* a minimal admin approve/reject route (needs an institution-scoped admin role surface that does not exist, and Sprint 7 builds it anyway); a one-off SQL script (unrepeatable, and `docs/local-setup.md` could not state a command that works on a clean machine).

**D5 — Agreements are not an activation condition yet.**
The activation predicate is Level 1 **and** an enrolled second factor. `VOLUNTEER_AGREEMENT`/`COMMUNITY_GUIDELINES` consents and orientation stay unbuilt and are recorded as debt with an owning change.
*Rejected:* recording agreement consents in this change (a mentor application and orientation surface, plus a consent-policy decision the owner has not taken, doubling this change).

**D6 — A re-claim supersedes; expiry is untouched.**
Claiming a different institution revokes the previous verified row in the same transaction. `expires_at` stays unused: affiliation expiry is still an open decision in `data-model.md` §4.3, and inventing it here would decide a policy that no requirement states.

**D7 — Every grant and revocation writes one audit row.**
`AFFILIATION_GRANTED` / `AFFILIATION_REVOKED` on `object_type = 'AFFILIATION'`, reuse of the existing audit writer, one row per state change.
*Rejected:* auditing only seed rows (then a self-service grant would be the one unaudited trust change in the system, against `AGENTS.md` rule 7).

**D8 — The claim route joins the authorization matrix.**
It is registered as a session route in `authorization-matrix.test.ts` in the same change that adds it, per the repo trap.

## Assumptions

- better-auth's verified-email flag is the only proof of address ownership (already relied on by sign-up verification).
- `institution_domains.domain` is `citext`, so the case-insensitive rule needs no normalisation beyond trimming.
- One institution per account covers the pilot (D-57); if a second institution is ever needed, D1's index is the thing to revisit.
- `example.edu.bd` is a documentation placeholder, not a partnership claim.

## Risks / Trade-offs

- **Stored status can go stale** if a future path changes affiliation without calling the sync → mitigate: the table's writers live in the service that owns the transaction, and one test per trigger asserts the state.
- **Pending claims accumulate with no decision path** → accepted for the pilot (D-56); `GET /v1/me` shows them as `pending`, so the user is not told they are verified.
- **Activation without agreements** weakens FR-PROF-03 today → accepted and tracked; the predicate is one function, so adding clause three later is one line plus its tests.
- **Seed attestation is not a user action** → the row carries `decided_by_user_id = null` and a reason string, so the audit trail distinguishes system-attested from admin-attested affiliation.

## Migration Plan

Additive only: `0009` creates four enums, the `affiliations` table, its indexes and checks, and adds `onboarding_status` (default `APPLIED`) plus `activated_at` to `mentor_profiles`, with the hand-written `grants … TO connect_app` appended. Existing rows get `APPLIED` and keep `status = 'DRAFT'`, which is their current value. Rollback is a forward migration that drops the table and the two columns; nothing else reads them.
