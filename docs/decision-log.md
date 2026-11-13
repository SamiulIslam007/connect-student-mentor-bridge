---
title: Decision Log
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
---

# Decision Log

> One line per product or process decision. Architectural decisions also get an ADR in
> `docs/architecture-decisions.md`. Changing an Approved document needs an entry here.
> Status values: `Decided`, `Deferred (owner decision)`, `Superseded`.

## Template

```
### D-NN: <short title>
- Date:
- Decision:
- Reason:
- Status:
- Affects:
```

## Entries (2026-10-29)

### D-01: MVP scope and timeline
- Date: 2026-10-29
- Decision: MVP equals the pilot build, ready in about 2 months, at about 3 days per week. Few features, enough to convince universities.
- Reason: One builder; a pilot needs a credible core, not a full product.
- Status: Decided
- Affects: `README.md`, `milestones-and-phases.md`, `mvp-build-plan.md`

### D-02: Canonical enums and case mapping
- Date: 2026-10-29
- Decision: `data-model.md` section 4.1 is the single canonical enum source. DB values `UPPER_SNAKE`, API values `lower_snake`. Outcome has 7 states; request has `WITHDRAWN` and `EXPIRED` (no `CANCELLED`); account status and mentor onboarding status are split from operating status; consent has 8 documented purposes (5 in the MVP enum, 3 reserved: `AI_ASSIST`, `EMPLOYER_DATA_SHARING`, `RECORDING`).
- Reason: Stop five documents disagreeing about statuses.
- Status: Decided
- Affects: `data-model.md`, `glossary.md`, `api-contracts.md`, `auth-and-access-control.md`, `reputation-and-verification-policy.md`

### D-03: Request lifecycle
- Date: 2026-10-29
- Decision: A mentor must accept or decline within 48 hours. Expiry is 48 hours; reminder at 24 hours. Declining within 48 hours is not penalized; expiry is a non-response. The response-time KPI is the share of requests decided within 48 hours.
- Reason: A clear, testable promise to students.
- Status: Decided
- Affects: `data-model.md`, `api-contracts.md`, `functional-requirements.md`, `matching-algorithm-spec.md`, `reputation-and-verification-policy.md`

### D-04: Password minimum
- Date: 2026-10-29
- Decision: Minimum 12 characters, stated in `auth-and-access-control.md` only; NFR-SEC-02 and SEC-AUTH-3 reference it.
- Reason: One number, one owner document.
- Status: Decided
- Affects: `auth-and-access-control.md`, `non-functional-requirements.md`, `security-requirements.md`

### D-05: Date of birth
- Date: 2026-10-29
- Decision: A date of birth is accepted only to enforce the 18+ gate and is never stored. The account stores `age_18_plus` and `age_gate_passed_at`.
- Reason: Data minimization; no unnecessary sensitive data.
- Status: Decided
- Affects: `data-model.md`, `api-contracts.md`, `data-privacy-and-retention.md`, `functional-requirements.md`, `non-functional-requirements.md`

### D-06: Reputation formula
- Date: 2026-10-29
- Decision: Remove the cooling multiplier. `pair_factor = 1 / (1 + n)`, where `n` is earlier counted outcomes between the same mentor and student; configurable. Cooling is a state delay, not a multiplier.
- Reason: Removes a redundant factor and makes repetition penalties explicit.
- Status: Decided
- Affects: `reputation-and-verification-policy.md`, `data-model.md`, `functional-requirements.md`

### D-07: Student affiliation
- Date: 2026-10-29
- Decision: Students get Level 1 affiliation through institution attestation. AUTH-O3 is closed.
- Reason: Students without an institutional email still need to be matched and counted.
- Status: Decided
- Affects: `auth-and-access-control.md`, `reputation-and-verification-policy.md`, `assumptions-and-open-questions.md`

### D-08: Dynamic fields
- Date: 2026-10-29
- Decision: Fields are fully dynamic. A `fields` table has `id`, `name`, `normalized_slug`, `created_by`, `status`; users pick or create a field; `primary_field_id` is required on both profiles. An admin merge/rename tool is **Phase 1b** (D-23), not Later.
- Reason: No hard-coded taxonomy to maintain; matching uses field ids.
- Status: Decided
- Affects: `data-model.md`, `matching-algorithm-spec.md`, `functional-requirements.md`, `glossary.md`

### D-09: Disputes and appeals
- Date: 2026-10-29
- Decision: A platform admin (never an institution admin) decides each case once, with a written reason. Appeals, a second reviewer, and a formal process are Deferred until after a successful pilot. FR-ADM-02 is Later.
- Reason: One operator; a fair written decision is enough for the MVP.
- Status: Decided; appeals Deferred
- Affects: `reputation-and-verification-policy.md`, `functional-requirements.md`, `api-contracts.md`, `data-model.md`

### D-10: Small-cohort suppression
- Date: 2026-10-29
- Decision: Threshold = 5 individuals.
- Reason: Small pilot slices must not identify people.
- Status: Decided
- Affects: `data-model.md`, `non-functional-requirements.md`, `functional-requirements.md`, `data-privacy-and-retention.md`

### D-11: Identity provider
- Date: 2026-10-29
- Decision: Use `better-auth` embedded behind `IdentityService` (ADR-003). MVP login: Google plus email and password with verification and forgot-password. Facebook and LinkedIn are Later; Microsoft is removed; phone OTP and SAML are not in the MVP.
- Reason: Fewest moving parts for one builder; SAML can come later behind the same seam.
- Status: Decided
- Affects: `architecture-decisions.md`, `auth-and-access-control.md`, `api-contracts.md`, `system-architecture.md`

### D-12: ORM
- Date: 2026-10-29
- Decision: Prisma (closes O-1, ADR-002).
- Reason: Mature migrations, strong agent familiarity.
- Status: Superseded by D-30 (2026-10-30)
- Affects: `architecture-decisions.md`, `system-architecture.md`, `data-model.md`

### D-13: Job runner
- Date: 2026-10-29
- Decision: `pg-boss`, the simplest Postgres-backed option. Provisional; revisit only if blocked.
- Reason: No extra infrastructure at pilot scale.
- Status: Decided (provisional)
- Affects: `architecture-decisions.md`, `system-architecture.md`

### D-14: Docker from day one
- Date: 2026-10-29
- Decision: Local development depends on Docker Compose. The same images run on the chosen host later. A GitHub repository with CI (lint, type-check, tests, build) exists at the start.
- Reason: Environment parity and a working merge gate from Sprint 0.
- Status: Decided
- Affects: `architecture-decisions.md`, `production-requirements.md`, `milestones-and-phases.md`

### D-15: Hosting
- Date: 2026-10-29
- Decision: Hosting provider (Heroku, Render, or Azure) and region are undecided and chosen after the MVP. Not a Gate 0 blocker. Domain from the GitHub Student Pack.
- Reason: Hosting is swappable when everything is containerized; it should not delay coding.
- Status: Deferred (owner decision)
- Affects: `production-requirements.md`, `milestones-and-phases.md`, `system-architecture.md`

### D-16: MVP exclusions
- Date: 2026-10-29
- Decision: Excluded from the MVP: payments, Flutter/native apps, Zoom API integration, Redis, WebSocket/real-time, AI features and models, phone OTP, SAML, Microsoft login. AI-1 and Epic E8 move to Later.
- Reason: Fit the MVP into about 8 part-time weeks without cutting trust rules.
- Status: Decided
- Affects: `functional-requirements.md`, `milestones-and-phases.md`, `README.md`, `production-requirements.md`

### D-17: Launch parameters
- Date: 2026-10-29
- Decision: Launch country is Bangladesh only. Users are 18+ only. UI language is English only, with the string catalog kept.
- Reason: One market, one language, one age policy for the pilot.
- Status: Decided
- Affects: `README.md`, `non-functional-requirements.md`, `auth-and-access-control.md`

### D-18: Method and cadence
- Date: 2026-10-29
- Decision: Spec-driven development with OpenSpec (OpenCode or Claude Code). Sprints are 1 week until the MVP/pilot launches, then 2 weeks during the pilot.
- Reason: Short feedback loops; specs before code.
- Status: Decided
- Affects: `milestones-and-phases.md`, `architecture-decisions.md`, `AGENTS.md`

### D-19: Pilot partner
- Date: 2026-10-29
- Decision: Partner type (university, bootcamp, or small department) stays open and is not a Gate 0 blocker. Partner talks are already happening.
- Reason: A decision does not need to block the build.
- Status: Open
- Affects: `assumptions-and-open-questions.md`, `pilot-plan.md`

### D-20: Gates
- Date: 2026-10-29
- Decision: Gate 0 is lightweight (contradictions fixed, setup files present, MVP baseline docs approved). Gate 1 = MVP acceptance. Gate 2 = before real users: Terms, Privacy Notice, consent screens, backup-restore test, runbook. Gate 3 unchanged.
- Reason: Stop documentation perfection from blocking code.
- Status: Decided
- Affects: `milestones-and-phases.md`, `production-requirements.md`, `pilot-plan.md`, `assumptions-and-open-questions.md`

### D-21: Deferred legal and commercial work
- Date: 2026-10-29
- Decision: Deferred until after the pilot and removed from Gate 0 and Gate 1: trust-and-safety reviewer naming (N7/P3), data residency (N3), legal entity (N2), counsel engagement, willingness-to-pay and pricing, buyer interviews, mentor-recruitment experiments, brand clearance. Each item stays listed.
- Reason: None of these block writing the MVP; all are better informed by pilot evidence.
- Status: Deferred (owner decision)
- Affects: `assumptions-and-open-questions.md`, `production-requirements.md`, `pilot-plan.md`, `legal-and-compliance-checklist.md`, `security-requirements.md`

### D-22: Agent git permissions
- Date: 2026-10-29
- Decision: Agents branch and commit only. They never push or merge to `main` without the owner, never force-push, never touch secrets or `.env`. Stated in `AGENTS.md`.
- Reason: The minimal safe default; N11 is closed.
- Status: Decided
- Affects: `AGENTS.md`, `security-requirements.md`, `architecture-decisions.md`

### D-23: Endpoints and requirement moves
- Date: 2026-10-29
- Decision: Add `POST /v1/outcomes/{id}/withdraw`, `GET /v1/privacy/export/{id}/download`, mentor pause/resume, and account deactivate; rename request cancel to withdraw. Move FR-REQ-04, FR-ADM-08/09, and the institution funnel detail to Phase 1b.
- Reason: Every MVP Must requirement needs an endpoint; non-MVP work should not block Gate 1.
- Status: Decided
- Affects: `api-contracts.md`, `functional-requirements.md`, `milestones-and-phases.md`

### D-24: Retention ownership
- Date: 2026-10-29
- Decision: `data-privacy-and-retention.md` owns the retention schedule; `data-model.md` section 8 summarizes and points to it.
- Reason: One owner for a legal-sensitive table.
- Status: Decided
- Affects: `data-model.md`, `data-privacy-and-retention.md`

### D-25: Recognition
- Date: 2026-10-29
- Decision: Mentors are volunteers and receive an institution-signed certificate. Students are free. Nobody pays to verify an outcome.
- Reason: Recognition without payment keeps the model and the trust rules simple.
- Status: Decided
- Affects: `pilot-plan.md`, `reputation-and-verification-policy.md`, `business-model-and-pricing.md`

> **D-26 was never used.** The gap is intentional and the number is not reused; the next free number after D-39 is D-40.

### D-27: Browser-to-API transport
- Date: 2026-10-29
- Decision: The browser talks only to the Next.js app on its own origin (httpOnly session cookie at the BFF). The BFF calls the NestJS API with a short-lived Bearer token. The API does not issue browser cookies.
- Reason: One CSRF boundary, no cross-origin cookie configuration between the `web` and `api` containers, and a generated client that points at one base URL.
- Status: Decided
- Affects: `auth-and-access-control.md`, `api-contracts.md`, `system-architecture.md`

### D-28: Evidence malware scanning
- Date: 2026-10-29
- Decision: A ClamAV container in Docker Compose scans evidence before promotion. A managed scanning service is a Later replacement.
- Reason: Keeps the "no signed URL until CLEAN" rule implementable inside the MVP without an external dependency.
- Status: Decided (provisional)
- Affects: `system-architecture.md`, `production-requirements.md`, `milestones-and-phases.md`

### D-29: Repository content
- Date: 2026-10-29
- Decision: This repository contains documentation only. There is no application code or running app yet.
- Reason: Remove a stale description that implied a built product.
- Status: Decided
- Affects: `README.md`, `system-architecture.md`, `architecture-decisions.md`

## Entries (2026-10-30)

### D-30: ORM changed to Drizzle
- Date: 2026-10-30
- Decision: The ORM is **Drizzle ORM**, replacing Prisma (supersedes D-12; re-closes O-1; ADR-018 supersedes ADR-002). The schema is declared in TypeScript (`pgTable` definitions in the API service), `drizzle-kit` generates and runs the SQL migrations, and queries go through the Drizzle query builder. Hand-written SQL inside the same migrations carries triggers, role grants, and ledger immutability.
- Reason: Closer to raw SQL and more control over constraints, indexes, triggers, and grants; a better fit for learning and for the append-only ledger and state-machine schema. No schema or migration had been written, so nothing had to be migrated.
- Status: Decided
- Affects: `architecture-decisions.md`, `system-architecture.md`, `milestones-and-phases.md`, `production-requirements.md`, `README.md`, `AGENTS.md`

## Entries (2026-11-03)

### D-31: Session model is better-auth's cookie session
- Date: 2026-11-03
- Decision: Identity uses better-auth's Postgres-backed cookie session behind `IdentityService`: 30-day lifetime, `updateAge` 1 day, no `cookieCache`, httpOnly SameSite=Lax cookie held by the Next.js BFF. The earlier 15-minute access token plus rotating refresh token design is not used. Admin idle timeouts (30 minutes / 8 hours) are deferred to the Sprint 2 change `access-google-mfa-and-sessions` with MFA. SEC-AUTH-5's refresh-token-reuse rule maps to session-row revocation.
- Reason: The library's session model is simpler and still server-authoritative; nothing is deployed and no token design had been implemented.
- Status: Decided
- Affects: `auth-and-access-control.md`, `system-architecture.md`, `api-contracts.md`, `data-model.md`

### D-32: Migration ownership and workflow
- Date: 2026-11-03
- Decision: Drizzle schema is committed TypeScript; `drizzle-kit generate` produces committed SQL under `services/api/drizzle/`, and `drizzle-kit migrate` applies it (owner-approved for local and test databases in this change). Migrations are forward-only. The `postgresql` MCP stays read-only and never applies DDL. The append-only grants create the `connect_app` role; local development connects as the database owner, so the tests assert the grants with `SET ROLE connect_app`.
- Reason: One predictable path from schema change to migration, with the ledger guarantees enforced in the database.
- Status: Decided
- Affects: `local-setup.md`, `data-model.md`, `architecture-decisions.md`

### D-33: Identity scope split
- Date: 2026-11-03
- Decision: `identity-better-auth` (Sprint 1) covers email/password registration, verification, sign-in, sign-out, sign-out-everywhere, password reset, the Postgres session store, the 18+ gate, consent rows, audit rows, the database foundation, and the institution seed. Google sign-in, MFA, the session list and per-session revoke, role-based authorization, and provider account linking move to the Sprint 2 change `access-google-mfa-and-sessions`. `age-gate-and-account-status` narrows to the account-status lifecycle; the 18+ gate ships here.
- Reason: `mvp-build-plan.md` and `milestones-and-phases.md` disagreed about Sprint 1 scope; one reference removes the contradiction and keeps Sprint 1 reviewable.
- Status: Decided
- Affects: `mvp-build-plan.md`, `milestones-and-phases.md`, `api-contracts.md`, `functional-requirements.md`

### D-34: Repository content supersedes D-29
- Date: 2026-11-03
- Decision: The repository is no longer documentation only (supersedes D-29). It contains the Sprint 0 platform baseline and the Sprint 1 identity code: pnpm workspace, Compose stack, database schema and migration, and the auth API and web routes.
- Reason: D-29 described the state before any application code existed and is stale.
- Status: Decided
- Affects: `README.md`, `system-architecture.md`

### D-35: Account status activates on email verification
- Date: 2026-11-03
- Decision: Change #3 is renamed `account-status-lifecycle` (was `age-gate-and-account-status`), because the 18+ gate shipped in `identity-better-auth` and the remaining scope is the account-status lifecycle plus the blocked-signup policy. Activation happens on email verification: opening the verification link moves `PENDING` to `ACTIVE`, only an `ACTIVE` account can sign in, and the status is evaluated only after the password is accepted.
- Reason: `PENDING` needs a reachable exit, otherwise every later capability gates on a value that is never true. Email verification is the only state an account can reach inside this change, it already exists as `email_verified`, and FR-AUTH-01 already uses verified/unverified as the permission boundary, so activation is a mechanical consequence of an existing rule rather than a new policy.
- Status: Decided
- Affects: `mvp-build-plan.md`, `milestones-and-phases.md`, `functional-requirements.md`, `auth-and-access-control.md`, `api-contracts.md`, `data-model.md`

### D-36: Deactivation is reversible by signing in
- Date: 2026-11-03
- Decision: A `DEACTIVATED` account that signs in with the correct password returns to `ACTIVE` and receives a session. There is no separate reactivation endpoint and no `ACCOUNT_DEACTIVATED` error code. The transition is one idempotent update (`WHERE status = 'DEACTIVATED'`) in the session-creation hook, plus one `ACCOUNT_ACTIVATED` audit entry.
- Reason: The docs describe deactivation as a pause but never said how the pause ends. Reversal on a successful password sign-in is the only option that adds no endpoint and no new unauthenticated write path, and the password was already verified before the status is read.
- Status: Decided (owner confirmation of the design D5 Proposed default during the `account-status-lifecycle` apply)
- Affects: `openspec/changes/account-status-lifecycle/design.md`, `data-model.md`, `api-contracts.md`, `auth-and-access-control.md`

### D-37: Signup block stays at 12 months
- Date: 2026-11-03
- Decision: The `signup_blocks` entry written after an under-18 attempt expires 12 months after the attempt, and registration reads it before the age gate. The duration stays one named constant, so shortening it later is a code change and not a migration.
- Reason: Twelve months is the value already Proposed in `data-model.md`, and the block exists to stop a resubmission with a changed date of birth rather than to punish the applicant.
- Status: Decided (owner confirmation during the `account-status-lifecycle` apply)
- Affects: `data-model.md`, `openspec/changes/account-status-lifecycle/design.md`

### D-38: Mentor weekly capacity maximum is 5
- Date: 2026-11-03
- Decision: A mentor's `weekly_capacity` is an integer from 1 to 5. The maximum is the domain constant `MENTOR_WEEKLY_CAPACITY_MAX = 5`, encoded as a **Proposed default** and not in DDL: the database checks only `weekly_capacity >= 1`. Sprint 7 replaces the constant with versioned configuration (`config_versions`).
- Reason: The upper bound is product policy, not data integrity, so encoding 5 in the schema would need a migration to change a number. One named constant is the smallest truthful representation until versioned configuration exists.
- Status: Decided (owner confirmation of design D7 during the `profiles-and-dynamic-fields` apply)
- Affects: `openspec/changes/profiles-and-dynamic-fields/design.md`, `data-model.md`, `api-contracts.md`, `functional-requirements.md`

### D-39: Profile saves use last write wins, not `If-Match`
- Date: 2026-11-03
- Decision: `PUT /v1/me/student-profile` and `PUT /v1/me/mentor-profile` are last-write-wins self-service saves. There is no `If-Match` header, no `ETag`, and no version column.
- Reason: Each profile has exactly one owner and is edited from one browser session, so there is no second writer to lose an update against. Optimistic concurrency would add contract surface and client behavior for no user-visible benefit; capacity overshoot is guarded later by the requests-and-capacity row lock, not by profile versions.
- Status: Decided (owner confirmation of design D8 during the `profiles-and-dynamic-fields` apply)
- Affects: `openspec/changes/profiles-and-dynamic-fields/design.md`, `api-contracts.md`, `data-model.md`

### D-40: Under-18 signup-block griefing accepted for now
- Date: 2026-11-03
- Decision: A registration attempt with an under-18 date of birth writes a 12-month `signup_blocks` row for the submitted email before ownership is proven. This lets someone pre-block an arbitrary address from registering. The risk is accepted for the pilot and revisited before real users; the Sprint 7 rate limit reduces the volume. The block stays 12 months (D-37).
- Reason: The block exists to stop a resubmission with a changed date of birth; moving it after email verification would defeat that purpose. An existing account holder can still sign in, so the impact is limited to new registrations with that address.
- Status: Decided (accepted risk, owner delegated)
- Affects: `docs/known-debt.md`, `openspec/changes/sprint1-hardening-and-plan-closure/design.md`

### D-41: SEC-API-1 strict unknown-field rejection is Sprint 7
- Date: 2026-11-03
- Decision: Keep named-field validation and ignore unknown keys for now. `SEC-API-1` (reject unknown fields) is owned by the Sprint 7 hardening work, not this change.
- Reason: The profile spec requires `account_status` in a body to be ignored without a 422, and adding strict rejection only on new endpoints would create two validation styles. A single API-wide strict path belongs in the hardening sprint.
- Status: Decided
- Affects: `docs/security-requirements.md`, `docs/api-contracts.md`, `docs/known-debt.md`

### D-42: Append-only deletion semantics
- Date: 2026-11-03
- Decision: `audit_logs.actor_user_id` changes to `ON DELETE RESTRICT`; `consent_records.user_id` stays `RESTRICT`; every future ledger FK to `users` uses `RESTRICT`. Append-only is enforced by grants plus `RESTRICT`, not a trigger. User deletion is pseudonymization, never a hard delete of a user with ledger rows.
- Reason: `ON DELETE SET NULL` rewrites append-only audit history; a trigger would add a second enforcement path. `RESTRICT` makes the invariant explicit and leaves pseudonymization to the privacy/deletion change.
- Status: Decided
- Affects: `docs/data-model.md`, `docs/known-debt.md`, `openspec/changes/sprint1-hardening-and-plan-closure/design.md`

### D-43: Taxonomy bounds and field pagination
- Date: 2026-11-03
- Decision: A mentor may have at most 5 fields total (the primary plus up to 4 additional); students and mentors may list at most 5 languages. Field names are NFKC-normalized, Unicode format characters (`Cf`) are stripped, and a name with no letter or number after normalization is refused. `GET /v1/fields` uses a keyset cursor by `normalized_slug`, default limit 100, maximum 200, ordered by slug. Cross-script confusables are a documented known limit, curated in Phase 1b.
- Reason: The shared taxonomy is created by any authenticated user, never deleted, and was unpaginated before this change; unbounded arrays and invisible names let one request pollute every client. The primary field stays separate from the additional fields.
- Status: Decided
- Affects: `docs/api-contracts.md`, `docs/data-model.md`, `docs/known-debt.md`, `openspec/changes/sprint1-hardening-and-plan-closure/design.md`

### D-44: CI runs the database integration tests
- Date: 2026-11-03
- Decision: The `checks` CI job starts a `postgres:16-alpine` service, creates `connect_test`, and sets `DATABASE_URL`. The test support fails (not skips) when `CI=true` and the database is unreachable. The three required check names stay `checks`, `images`, and `security` because the `protect-main` ruleset requires them.
- Reason: A green gate that skips 47 of 56 API tests does not verify the auth/profile boundary; Sprint 2 adds MFA and session endpoints on that boundary.
- Status: Decided
- Affects: `docs/local-setup.md`, `docs/milestones-and-phases.md`, `docs/mvp-build-plan.md`, `docs/known-debt.md`, `openspec/changes/sprint1-hardening-and-plan-closure/design.md`

### D-45: The second-factor challenge is relayed, not re-implemented
- Date: 2026-11-04
- Decision: A password sign-in for an account with an active TOTP factor returns `mfa_required` plus an opaque `mfa_challenge`. The value is the `better-auth` two-factor cookie pair the library issued; `POST /v1/auth/mfa/verify` replays it as the `Cookie` header and the library consumes its own verification row. The API's `IdentityService` never mints a challenge of its own.
- Reason: The API holds no browser cookies (`docs/auth-and-access-control.md` §5), so the challenge cannot live in a cookie between the two calls. Relaying keeps the HMAC, the ten-minute expiry, the single-use consume, the per-challenge attempt counter, and the account lockout in the library that already implements them, instead of duplicating them beside the trust core.
- Status: Decided
- Affects: `openspec/changes/access-google-mfa-and-sessions/design.md`, `docs/auth-and-access-control.md`, `packages/contracts/openapi.yaml`

### D-46: Google sign-in is registered from the environment and MFA cannot be bypassed by it
- Date: 2026-11-04
- Decision: `socialProviders.google` is configured only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty; otherwise `POST /v1/auth/sign-in/provider` answers `503 PROVIDER_UNAVAILABLE` and the initiator never leaves the server. There is no default, placeholder, or committed client id. An account with an active second factor is refused (`403 FORBIDDEN`) on the provider path and must sign in with the password, because the library gates only the password path on the second factor.
- Reason: A boot failure without credentials would break every local stack and CI run; a fallback client id would be a committed secret-shaped value. The bypass would apply to exactly the accounts that must have MFA (Mentors, Institution Admins, Platform Admins), so it is closed rather than documented as a known gap.
- Status: Decided
- Affects: `openspec/changes/access-google-mfa-and-sessions/design.md`, `docs/auth-and-access-control.md`, `docs/api-contracts.md`

### D-47: Role authorization and profile visibility move to `roles-and-profile-visibility` (4c)
- Date: 2026-11-04
- Decision: `access-google-mfa-and-sessions` (4a) ships Google sign-in, TOTP enrollment/verification, and the session list/revoke. Role-based authorization beyond the session guard (`FR-AUTH-07`), profile visibility, the permission-matrix test, and the admin idle/absolute session timeouts move to a new Sprint 2 change `roles-and-profile-visibility` (4c), ordered before `#5 affiliation-and-mentor-onboarding`.
- Reason: Enforcement needs the `role_assignments` table *and* an endpoint whose policy it guards. Shipping the table alone would be untested policy, and shipping a guard with no consumer is dead code. The three security-sensitive pieces of 4a are not deferred.
- Status: Decided
- Affects: `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` §5.2, `docs/known-debt.md`

### D-48: Second-factor enrollment lives in the web app; the admin timeouts move to Sprint 7
- Date: 2026-11-05
- Decision: `account-access-ui` adds the enrollment, verification, and disable UI at `/account/security` using the endpoints 4a already ships, and adds one additive field, `mfa_enabled`, to the `GET /v1/me` response so the page can tell an enrolled account from an unenrolled one. The sign-in response keeps its narrower shape. Signing out of the current session is a header action that ends only that session; the "sign out of all sessions" action moves from the sign-in page to `/account/sessions`. The admin idle and absolute session timeouts belong to Sprint 7 with the admin surface, not to 4c, superseding the 4c mention in D-47 for those two items.
- Reason: The 4a backend was reachable only through the API, so no user could create a factor and 4c's role-keyed enforcement would have been a lockout. One boolean on the caller's own record is cheaper than a new endpoint and does not widen the sign-in contract. A timeout policy with no admin surface is untestable policy, and Sprint 7 is where the admin session settings land.
- Status: Decided
- Affects: `openspec/changes/account-access-ui/design.md`, `docs/auth-and-access-control.md` §4.5 and §5, `docs/api-contracts.md`, `packages/contracts/openapi.yaml`, `docs/known-debt.md`

### D-49: The mentor role is opt-in and grants no visibility, activation, or discoverability
- Date: 2026-11-05
- Decision: `POST /v1/me/roles/mentor` grants `MENTOR` to the calling account, idempotently and with one `ROLE_GRANTED` audit entry on an actual grant. The migration backfills `STUDENT` for every pre-existing account (with an audit row each) but never backfills `MENTOR`, even where a mentor profile exists. Holding the role changes no response other than the caller's own `roles`.
- Reason: A privileged role must come from an explicit act by the account, not from an inference about data it happens to own; a backfilled `MENTOR` would also need an audit row claiming a consent nobody gave. Activation stays with #5, so the role cannot leak visibility before the activation rules exist.
- Status: Decided
- Affects: `openspec/changes/roles-and-profile-visibility/design.md`, `docs/auth-and-access-control.md` §3, `docs/api-contracts.md`, `docs/data-model.md` §5.1

### D-50: The MFA-by-role policy ships before its first consumer
- Date: 2026-11-05
- Decision: `requiresMfa(role)` and the `requiresMfa` option on `requireRole` ship in 4c, with `MFA_REQUIRED` in the problem catalog, although no route passes the flag. `PUT /v1/me/mentor-profile` is deliberately not MFA-gated. This is a documented exception to D-47's "no guard with no consumer" reasoning.
- Reason: #5 needs the mechanism the moment mentor activation begins, and there is no admin route to hang it on yet. It is kept from rotting by a unit test per role and an integration test that calls the guard with the flag for an unenrolled and an enrolled account; gating the mentor profile save would lock a just-opted-in mentor out of their own form.
- Status: Decided
- Affects: `openspec/changes/roles-and-profile-visibility/design.md`, `docs/security-requirements.md` (SEC-AUTH-2), `docs/known-debt.md` (DEBT-14)

### D-51: A role denial has its own problem codes
- Date: 2026-11-05
- Decision: `ROLE_REQUIRED` and `MFA_REQUIRED` are separate `403` codes in the catalog. `FORBIDDEN` keeps its sign-in meaning.
- Reason: `FORBIDDEN` is authored for "this account cannot sign in" and is asserted by the sign-in tests. The web app also has to tell "you lack a role" (offer the opt-in) from "you may not sign in at all", and a client needs a stable code rather than parsing prose.
- Status: Decided
- Affects: `docs/api-contracts.md`, `packages/contracts/openapi.yaml`, `apps/web/app/profile/page.tsx`

### D-52: Each availability window carries its own time zone
- Date: 2026-11-05
- Decision: `availability_windows.timezone` is per row (IANA zone), and the form defaults new rows to the account's `timezone` from `GET /v1/me`. `start_minute` and `end_minute` are wall-clock minutes in that zone; nothing is stored converted.
- Reason: A mentor travelling or a student in another zone makes one account-level zone wrong, and the availability-match factor in #6 stays a pure comparison when the minutes are already local to their own zone.
- Status: Decided
- Affects: `openspec/changes/profile-availability-and-access-mode/design.md`, `docs/data-model.md` §5.2, `packages/contracts/openapi.yaml`

### D-53: `access_mode` is optional on the full-replace profile save
- Date: 2026-11-05
- Decision: `PUT /v1/me/mentor-profile` accepts an optional `access_mode` (`OPEN` or `APPLICATION_ONLY`). Absent leaves the stored mode alone, and `PAUSED` is not accepted there; pause and resume own it.
- Reason: The save is a full replace, so a required field would break every existing client and test, and an optional one that reset to `OPEN` would silently unpause a mentor. `PAUSED` is a separate act with a separate route.
- Status: Decided
- Affects: `docs/api-contracts.md`, `packages/contracts/openapi.yaml`, `apps/web/app/profile/page.tsx`

### D-54: 21 availability windows per context is a Proposed default
- Date: 2026-11-05
- Decision: `MAX_AVAILABILITY_WINDOWS_PER_CONTEXT = 21` (three a day across seven days) is enforced by the pure validator and documented in the contract as a maximum, not by a database constraint. Sprint 7 moves it to versioned configuration with the other D-38 defaults.
- Reason: The cap is policy, not data integrity: a legitimate three-a-day pattern must be expressible, and changing a policy number should not need a migration.
- Status: Decided
- Affects: `docs/functional-requirements.md` (FR-PROF-01), `packages/contracts/openapi.yaml`, `docs/known-debt.md`


### D-55: Mentor certificates are out of MVP scope
- Date: 2026-11-08
- Decision: The MVP issues no certificate artifact of any kind. No requirement, table, route, or field exists for certificates, and no change in `mvp-build-plan.md` §5 depends on one. Mentor recognition stays a product promise for after the pilot.
- Reason: The certificate was never a requirement ID and had no owner in the build plan; carrying it would add a document generator and an institution signing path to a two-month pilot build.
- Status: Decided
- Affects: `docs/functional-requirements.md`, `docs/mvp-build-plan.md`, `docs/business-model-and-pricing.md`, `docs/assumptions-and-open-questions.md`

### D-56: Institution attestation is a seeded row, not a surface
- Date: 2026-11-08
- Decision: Level 1 affiliation by attestation is delivered by extending the checked-in seed, which writes `affiliations` rows with method `ADMIN_ATTESTATION` and status `VERIFIED`. There is no admin route, no admin page, and no separate CLI tool for it in the MVP build; the admin dashboard is Sprint 7 work.
- Reason: Attestation has to exist for the pilot partner, but an institution admin surface has no other consumer yet and would be built twice. A seed row is auditable by diff and reversible by re-running the seed.
- Status: Decided
- Affects: `docs/auth-and-access-control.md` §7, `docs/api-contracts.md` §5.2, `docs/data-model.md` §5.1, `docs/known-debt.md`

### D-57: The pilot institution domain is a placeholder
- Date: 2026-11-08
- Decision: The seeded institution domains stay placeholder values (`example.edu.bd` and the existing illustrative entries). Nothing in the MVP accepts an operator-supplied domain: entering real domains arrives with the future admin dashboard.
- Reason: The pilot partner is not contracted yet, so a real domain would be a guess recorded as data; the placeholder keeps the domain-match path testable end to end without claiming a partnership.
- Status: Decided
- Affects: `services/api/src/db/seed/institutions.ts`, `docs/local-setup.md`, `docs/data-model.md` §5.1

### D-59: Capacity counts a rolling 7-day window
- Date: 2026-11-08
- Decision: `requests-and-48h-flow` (#7) counts a mentor's slots in use as `PENDING` requests plus requests accepted with `decided_at` inside the last 7 days. FR-REQ-06's "current week" is read as this rolling window rather than a calendar week.
- Reason: A calendar week needs a timezone boundary nobody decided; a rolling 7 days expresses the same intent without ambiguity and is one predicate if it changes later.
- Status: Decided
- Affects: `docs/functional-requirements.md` FR-REQ-06, `docs/api-contracts.md` §5.4, `openspec/specs/mentorship/request-lifecycle`

### D-58: Discovery (#6) is deferred; outbox and requests follow affiliation
- Date: 2026-11-08
- Decision: Build order after Sprint 2 is `affiliation-and-mentor-onboarding` (#5) -> `outbox-and-job-runner` (6a) -> `requests-and-48h-flow` (#7). `matching-and-discovery` (#6) is deliberately skipped for now and keeps its place in the plan, unbuilt.
- Reason: The 48-hour request flow is the product's spine and the outbox is its only reminder mechanism; discovery without a request flow cannot be demonstrated end to end.
- Status: Decided
- Affects: `docs/mvp-build-plan.md` §5 and §2, `docs/milestones-and-phases.md` §Current state


### D-60: A mentorship is created inside the accept transaction
- Date: 2026-11-08
- Decision: Accepting a `PENDING` request inserts exactly one `mentorships` row (unique `request_id`, `field_id` copied from the request, `is_paid` false) in the same transaction as the status change. A failed insert rolls the decision back: the request stays `PENDING` and no email is queued. A decline creates no mentorship.
- Reason: An asynchronous `MentorshipCreated` event would leave accepted requests without a mentorship whenever the worker is behind, which is exactly the dead end DEBT-20 recorded. One transaction makes `ACCEPTED` and the mentorship exist or neither does.
- Status: Decided
- Affects: `docs/data-model.md` §4.2 and §5.3, `docs/api-contracts.md` §5.4 and §5.5, `openspec/specs/mentorship/request-lifecycle`, `docs/known-debt.md` (DEBT-20 closed)

### D-61: Resume refuses at capacity while D-59 stays unchanged
- Date: 2026-11-08
- Decision: Resuming a `PAUSED` mentor profile counts the mentor's live `ACTIVE` mentorships under the mentor-profile row lock and refuses with `409 CAPACITY_BELOW_ACTIVE` when that count is at or above `weekly_capacity`; the stored mode stays `PAUSED`. Pausing never runs a capacity check. D-59's request-based count (pending requests plus requests accepted in the last 7 days) is untouched.
- Reason: A paused mentor who already holds a full caseload must not resume into more work, but re-basing the request capacity on mentorships is a decision the owner explicitly deferred.
- Status: Decided
- Affects: `docs/api-contracts.md` §5.2 and §10, `docs/functional-requirements.md` FR-PROF-03, `openspec/specs/profiles/availability-and-access-mode`, `docs/known-debt.md` (DEBT-17 closed)

### D-62: One email per thread message, no digest, no read state
- Date: 2026-11-08
- Decision: Posting a thread message queues exactly one notification email to the other participant through the outbox, keyed `email:thread-message:<message id>`; the body names the sender and links to the mentorship and carries no other message's text. There is no digest, no inline send, no read state, and no redaction in the MVP.
- Reason: The owner chose one email per message over a digest; read receipts and moderation have no surface until Sprint 7, and a column with no reader is debt. A retried identical post therefore creates a second message (recorded as DEBT-21).
- Status: Decided
- Affects: `docs/api-contracts.md` §5.5, `docs/functional-requirements.md` FR-THR-02, `docs/known-debt.md` (DEBT-21), `openspec/specs/mentorship/thread-and-sessions`


### D-63: A platform-decided outcome never earns mentor reputation
- Date: 2026-11-08
- Decision: An outcome whose counted basis is a platform decision never produces mentor reputation, whatever a reviewer later decides; it may count for the student's progress and institution aggregates only, and reads label it "platform-decided". Mentor reputation requires `counted_basis = MENTOR_CONFIRMED` with `coi_declared = false`.
- Reason: This settles `OUT-Q1` in favour of the product's central rule ("unconfirmed means uncounted"). The rule ships as an executable predicate before any counting code exists, so the counting change cannot disagree with it.
- Status: Decided
- Affects: `docs/data-model.md` §4.4, `docs/functional-requirements.md` FR-OUT-05, `docs/reputation-and-verification-policy.md` §5, `packages/domain/src/outcome.ts`

### D-64: Evidence is Tier 0 only in the MVP
- Date: 2026-11-08
- Decision: The MVP ships no evidence upload, no signed URL, and no malware scan for outcomes. `outcomes.evidence_tier` stays 0 and the two evidence endpoints in `docs/api-contracts.md` §5.6 remain documented but unbuilt.
- Reason: A file path needs storage, scanning, retention, and a deletion design the pilot does not need; Tier 0 keeps the outcome flow demonstrable end to end. Recorded as DEBT-22 with the evidence change as its target.
- Status: Decided
- Affects: `docs/functional-requirements.md` FR-OUT-02 and FR-OUT-07, `docs/api-contracts.md` §5.6, `packages/contracts/openapi.yaml`, `docs/known-debt.md` (DEBT-22)

### D-65: This change stops at CONFIRMED; counting belongs to the next change
- Date: 2026-11-08
- Decision: `outcomes-and-verification` implements the report/confirm/dispute/conflict/withdraw half of the state machine only. `COUNTED`, the cooling-to-counting job, `REJECTED`, `REVERSED`, and the review queue are not reachable or exposed here; the cooling period constant is written into `cooling_ends_at` and read by nothing yet.
- Reason: The review queue and counting have their own guards and their own tests; shipping them in one change would put the append-only reputation ledger and the review decision in a single unreviewable diff.
- Status: Decided
- Affects: `docs/mvp-build-plan.md` §5 rows #9 and #10, `docs/milestones-and-phases.md` §Current state, `docs/data-model.md` §4.4


### D-66: #10 is split into counting and the review queue
- Date: 2026-11-08
- Decision: `reputation-and-platform-review` (#10) becomes `reputation-ledger-and-counting` (counting, the append-only ledger, the replayable snapshot, the counts-only impact read) plus a following row `platform-review-queue` (reviewer decisions with a written reason, `REJECTED`, clawback). The plan keeps both rows and the order.
- Reason: Counting has to be provably correct before a reviewer can reverse it, and the two halves have different guards and different tests. Shipping them in one diff would put the ledger and the review decision in one review.
- Status: Decided
- Affects: `docs/mvp-build-plan.md` §5 rows #10 and #10b, `docs/milestones-and-phases.md` §Current state, `docs/known-debt.md` (DEBT-23)

### D-67: Reputation multipliers ship as 1.0 placeholders
- Date: 2026-11-08
- Decision: `REPUTATION_DIFFICULTY_WEIGHTS`, `REPUTATION_TIER_MULTIPLIERS`, and `REPUTATION_CONTRIBUTION_MULTIPLIERS` are `1.0` for every key. Points therefore reduce to the pair factor. The values stay **Open** in `docs/reputation-and-verification-policy.md` §17 and are set after pilot data.
- Reason: The policy marks all three Open, so any other number would be an invented ranking. A uniform placeholder keeps the pipeline, the replay guarantee, and the tests real while exposing nothing.
- Status: Decided
- Affects: `packages/config/src/index.ts`, `docs/reputation-and-verification-policy.md` §17, `docs/functional-requirements.md` FR-REP-03, `docs/known-debt.md` (DEBT-24)

### D-68: The counts-only impact view ships before discovery
- Date: 2026-11-08
- Decision: `GET /v1/me/impact` and `GET /v1/mentors/{id}/impact` return counts by field and outcome type only, plus a `counted_outcomes` total. No `score`, `points`, `tier`, or ranking key exists, and `points_total` never leaves the server.
- Reason: Mentor recognition is the only non-monetary reward in the pilot, so a count is worth showing now; the numeric score needs thresholds nobody has set, and discovery (#6) is deferred by D-58, so nothing else consumes the view yet.
- Status: Decided
- Affects: `packages/contracts/openapi.yaml`, `docs/api-contracts.md` §5.3, `docs/functional-requirements.md` FR-REP-02 and FR-REP-07, `docs/known-debt.md` (DEBT-24, DEBT-25)

### D-69: The mentor directory has no rank or score

- Date: 2026-11-09
- Decision: `GET /v1/mentors` orders results by mentor profile id ascending and exposes no `match_score`, rank, points, tier, or "why this mentor" reason. No matching code runs, and nothing reads `match_score`.
- Reason: Match Score, its weights, and the reason text belong to `matching-and-discovery` (#6), which D-58 defers; D-67 already ships every reputation multiplier as a `1.0` placeholder, so any ranking now would be invented. A stable order is testable and needs no new column.
- Status: Decided
- Affects: `openspec/changes/mentor-directory`, `docs/api-contracts.md` §5.3, `docs/functional-requirements.md` FR-DISC-01 and FR-DISC-02

### D-70: The directory ships exactly the documented filters

- Date: 2026-11-09
- Decision: `GET /v1/mentors` accepts `field`, `language`, `access_state`, `cursor`, and `limit`, and nothing else. `field` matches the primary field or an additional field and is an opaque id; `language` is an exact case-insensitive match; `access_state` is `available`, `application_only`, or `full`; keyset pagination is on the mentor id, 1 to 50 per page, default 20. Filtering by availability windows is not built.
- Reason: The contract already documents this parameter set, and an availability filter needs a join over weekly windows that no screen needs yet. Shipping a smaller set keeps the change inside one day.
- Status: Decided
- Affects: `openspec/changes/mentor-directory`, `docs/api-contracts.md` §5.3, `docs/functional-requirements.md` FR-DISC-01, `docs/known-debt.md`

### D-71: The directory read is public; the request action is not

- Date: 2026-11-09
- Decision: The mentor directory is readable with no session and returns only mentor profile id, display name, headline, access mode, derived access state, primary field, fields, and languages. It never returns an email, an account id, a biography, an expertise summary, a scope statement, a weekly capacity, availability windows, or onboarding status. The Request action links to a signed-in route. The contract's list access changes from `S` to public, and `profiles/profile-visibility` is restated so the visibility policy still governs profile reads while the directory projection is the only anonymous read.
- Reason: A visitor should be able to see who is available before signing up, and a partner demo needs it; the narrow projection keeps the archived "an unauthenticated viewer sees nothing" rule meaningful for profiles while making the one exception explicit instead of accidental.
- Status: Decided
- Affects: `openspec/changes/mentor-directory`, `openspec/specs/profiles/profile-visibility`, `docs/api-contracts.md` §5.3, `docs/security-requirements.md`

### D-72: Directory cards carry no impact counts

- Date: 2026-11-09
- Decision: The directory card shows no counted-outcome totals; counts stay on the mentor detail read (`GET /v1/mentors/{id}/impact`).
- Reason: A count per card is one extra query per result, and DEBT-24 keeps the numeric score internal anyway. The list is for choosing, not for ranking.
- Status: Decided
- Affects: `openspec/changes/mentor-directory`, `docs/api-contracts.md` §5.3

### D-73: The pilot's platform admin role is granted by hand

- Date: 2026-11-09
- Decision: `PLATFORM_ADMIN` is granted for the pilot by one documented `INSERT INTO role_assignments (user_id, role) SELECT id, 'PLATFORM_ADMIN' FROM users WHERE email = '<owner email>' ON CONFLICT DO NOTHING;`. There is no script, no CLI command, and no role-grant page.
- Reason: One reviewer, one row. A self-service admin grant would be a trust-critical feature with no approval design, and a script drifts from the statement the docs already need.
- Status: Decided
- Affects: `openspec/changes/platform-review-queue`, `docs/api-contracts.md` §5.9, `docs/auth-and-access-control.md`, `docs/known-debt.md` (DEBT-19 stays separate)

### D-74: A rejected outcome may be reported again

- Date: 2026-11-09
- Decision: After a `REJECTED` decision the student may report a new outcome for the same mentorship; the rejected row stays terminal and unchanged. The existing state machine and schema allow several outcomes per mentorship, so no constraint changes.
- Reason: A rejected report is a failed attempt, not a ban, and append-only history is preserved by adding a row rather than editing one.
- Status: Decided
- Affects: `openspec/changes/platform-review-queue`, `docs/data-model.md` §4.4

### D-75: Clawback appends a reversal and re-derives the snapshot

- Date: 2026-11-09
- Decision: Reversing a counted outcome appends one `reputation_events` row with `event_type = 'REVERSAL'` and the negated points, leaves the original `COUNTED` event untouched, and decrements the field snapshot by one count and the same points. Replay subtracts reversals. Migration `0015` widens the `event_type` check and replaces the single unique index on `outcome_id` with two partial unique indexes.
- Reason: The ledger is append-only by ADR-008 and the replay test is the guarantee the pilot's credibility rests on; editing a stored total would break both.
- Status: Decided
- Affects: `openspec/changes/platform-review-queue`, `docs/data-model.md` §5.6, `docs/reputation-and-verification-policy.md` §7, `services/api/src/db/schema/reputation.ts`

### D-76: The review queue has no assignment, due date, or SLA

- Date: 2026-11-09
- Decision: FR-ADM-01's review queue ships without assignment, due dates, or time limits; one reviewer decides each case once, with a written reason. This is an explicit narrowing of the requirement's Must text.
- Reason: The pilot has one reviewer (the owner), so assignment and SLAs would be columns and states no one reads; the resolution and the reason — the part that protects the user — ship.
- Status: Decided
- Affects: `openspec/changes/platform-review-queue`, `docs/functional-requirements.md` FR-ADM-01, `docs/known-debt.md`

### D-77: The reviewer routes require an enrolled second factor

- Date: 2026-11-09
- Decision: The review queue read and the review decision both call `requireRole(identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, reusing the existing guard and its `403 MFA_REQUIRED` mapping.
- Reason: `identity/role-authorization` already answers `true` for `PLATFORM_ADMIN`, so the policy exists; the decision that reverses reputation must not be reachable with a password alone.
- Status: Decided
- Affects: `openspec/changes/platform-review-queue`, `docs/auth-and-access-control.md`, `docs/api-contracts.md` §5.9

### D-78: Unknown body properties are refused everywhere

- Date: 2026-11-09
- Decision: One shared guard refuses any top-level body property a route's documented schema does not define, with `422 VALIDATION_FAILED` naming the property, before any field extraction runs. The allowlist per route is asserted against `packages/contracts/openapi.yaml` by a contract test. `account_status` remains the only documented no-op. `user_id`, `student_id`, `mentor_id`, `field_id`, `role`, `roles`, and `actor_role` are refused rather than ignored.
- Reason: `SEC-API-1` is a Must requirement and DEBT-01 records that the current behaviour silently accepts account-level keys. Refusing is strictly stronger than ignoring, and the contract stays the single source for what a route accepts.
- Status: Decided
- Affects: `openspec/changes/request-validation-and-rate-limits`, `openspec/specs/{identity/role-authorization,profiles/student-and-mentor-profiles,profiles/availability-and-access-mode,institutions/affiliation-verification,mentorship/outcome-verification}`, `docs/security-requirements.md`, `docs/api-contracts.md` §1, `docs/known-debt.md` (DEBT-01)

### D-79: Throttling covers the credential routes and the enqueueing writes

- Date: 2026-11-09
- Decision: `@nestjs/throttler@6.7.1` limits `POST /v1/auth/register`, `sign-in`, `forgot-password`, `reset-password` and the writes that enqueue email or append ledger rows, keyed by the client IP only; `/healthz` and `/readyz` stay unthrottled. A refusal is `429 RATE_LIMITED` with a numeric `Retry-After`, and the identity library's own `429` is translated to the same shape.
- Reason: DEBT-02 records unthrottled credential stuffing and signup-block flooding, DEBT-12 records the library's 429 surfacing as a 500, and these are the routes whose abuse costs the most. Throttling every route would throttle ordinary browsing.
- Correction (2026-11-10, `trust-surfaces`): this row previously claimed the limit was "keyed by IP and, where known, by account". The shipped `ThrottlerModule` configuration keys on the client IP only, and `SEC-ABUSE-1`'s per-account bucket is not implemented; that gap is DEBT-27. The decision text is corrected rather than superseded because the code has never done otherwise.
- Status: Decided
- Affects: `openspec/changes/request-validation-and-rate-limits`, `docs/api-contracts.md` §9 and §10, `docs/security-requirements.md`, `docs/known-debt.md` (DEBT-02, DEBT-12)

### D-80: The throttle store is in process memory

- Date: 2026-11-09
- Decision: The throttler uses its in-memory store. `docs/security-requirements.md` states that a multi-instance deployment enforces the limit per instance and that a shared store is a post-pilot decision.
- Reason: ADR-006 forbids Redis in the MVP and the pilot runs one API instance; a shared store would add a dependency for a limit that does not need to be global yet.
- Status: Decided
- Affects: `openspec/changes/request-validation-and-rate-limits`, `docs/security-requirements.md`, `docs/local-setup.md`

### D-81: The rate-limit values ship as documented starting points

- Date: 2026-11-09
- Decision: `RATE_LIMITS` in `@connect/config` holds `auth` 5 per minute, `register` 3 per hour, `reset` 3 per hour, `write` 60 per minute, and `default` 120 per minute. Each is commented as a starting value pending pilot traffic, and `docs/api-contracts.md` §9 keeps concrete values **Open (SEC-O2)**.
- Reason: A throttle with no numbers does not ship; inventing a calibrated value would be a ranking nobody measured. Labelling them placeholders matches D-67's pattern for the reputation multipliers.
- Status: Decided
- Affects: `openspec/changes/request-validation-and-rate-limits`, `packages/config/src/index.ts`, `docs/api-contracts.md` §9, `docs/security-requirements.md`

### D-82: Registration requires an explicit consent acceptance, and the documents ship as versioned pages

- Date: 2026-11-10
- Decision: `POST /v1/auth/register` refuses a request unless the body carries `consent_accepted: true`, with `422 VALIDATION_FAILED` naming the field and no user, session, or consent row written. The terms of service and the privacy notice are published as session-free pages at `/terms` and `/privacy`, each rendering `CONSENT_DOCUMENT_VERSION` from `@connect/config`, which is also the `document_version` stored on the two `GRANTED` consent rows written in the registration transaction. Registration still writes exactly two rows (`TERMS`, `PRIVACY_NOTICE`).
- Reason: a consent record for a document the user was never shown is a false record, and FR-CONS-01 is Must. The API is the trust boundary; the checkbox in the browser is a convenience.
- Status: Decided
- Affects: `trust/consent-and-audit-records`, `docs/api-contracts.md` §4.1, `docs/auth-and-access-control.md`, `packages/config/src/index.ts`, `services/api/src/identity/auth.controller.ts`

### D-83: One disclaimer string is rendered beside every badge and impact summary

- Date: 2026-11-10
- Decision: `strings.disclaimer.verified` states that a verified badge means the affiliation was checked and that a counted outcome was confirmed by the mentor, and that outcomes are not independently audited by connect. It is rendered on every mentor-directory card and beside the profile impact summary, and no surface states or implies a platform audit. FR-VER-05 is Must.
- Reason: credibility depends on not overstating a check; one sentence in the catalog is the only place the wording can drift.
- Status: Decided
- Affects: `trust/verified-badge-disclaimer`, `docs/functional-requirements.md` FR-VER-05, `apps/web/lib/strings.ts`

### D-84: The data export is one synchronous JSON document

- Date: 2026-11-10
- Decision: `POST /v1/privacy/export` returns the caller's own rows from a fixed allowlist of tables and columns as one JSON document, with `Cache-Control: no-store` and `Content-Disposition: attachment`. No object storage, no signed URL, and no S3 client in the pilot; FR-PRIV-01's "short-lived download link" is narrowed to a direct response and the deeper delivery is DEBT-39. The allowlist is `users`, `accounts` (provider name only), `sessions` (id and timestamps, no token), `consent_records`, `audit_logs` where the caller is actor or object, `affiliations`, `availability_windows`, `student_profiles` with `student_field_interests`, `mentor_profiles` with `mentor_fields`, `role_assignments`, `mentorship_requests` sent and received, `mentorships`, `thread_messages` written by the caller only, `mentorship_sessions`, `outcomes` reported by the caller with their `outcome_events` and `verification_records`, and `privacy_requests`. The whole document is read in one repeatable-read transaction.
- Reason: a signed URL would add the first object-storage integration, a lifecycle and an expiry job for a document the user can receive directly at pilot volume.
- Status: Decided
- Affects: `trust/privacy-export-and-erasure`, `docs/api-contracts.md` §5.8, `docs/functional-requirements.md` FR-PRIV-01, `docs/known-debt.md`

### D-85: Deletion is a tombstone that leaves the ledger intact

- Date: 2026-11-10
- Decision: `POST /v1/privacy/delete` runs one transaction that sets `users.status = ANONYMIZED` and `anonymized_at`, replaces the stored email with the application's keyed HMAC-SHA256 hash (the same key the signup block uses), replaces `users.name` with `Deleted user` and the personal profile text columns with empty strings (placeholders, never `NULL`, because every one of those columns is `NOT NULL`), sets a mentor profile to `REMOVED` so it leaves discovery, replaces the caller's own `thread_messages.body` with a fixed tombstone string, deletes every session, every two-factor row, and every availability window, appends one `ACCOUNT_DELETED` audit entry and one `privacy_requests` row, and never updates or deletes an `outcomes`, `outcome_events`, `verification_records`, `reputation_events`, or `audit_logs` row. Interpretation of `mentorship/thread-and-sessions`: its "SHALL NOT accept attachments or edits" is a rule about routes and participants — no participant edit route exists and none is added — while erasure is a sanctioned system operation that writes a tombstone body; no MODIFIED delta is needed for that capability because its requirement text and scenarios stay true.
- Reason: FR-PRIV-02 is Must and the ledger rule (ADR-008) forbids rewriting history; the `RESTRICT` foreign keys and the `NOT NULL` columns forbid a hard delete and forbid `NULL`.
- Status: Decided
- Affects: `trust/privacy-export-and-erasure`, `docs/data-model.md`, `docs/data-privacy-and-retention.md`, `mentorship/thread-and-sessions` (interpretation only, no text change), `services/api/src/db/schema/`

### D-86: Deletion is confirmed by repeating the account email

- Date: 2026-11-10
- Decision: The delete body carries `confirm_email`, compared case-insensitively to the stored address; a mismatch is `422 VALIDATION_FAILED` naming the field and changes nothing. This replaces the "requires recent re-authentication" wording in `docs/api-contracts.md` §5.8.
- Reason: no `IdentityService` method verifies a password without creating a session, and the confirmation's job is to stop an accidental or cross-site delete, which `SameSite=Lax` plus a `POST` body already mostly does.
- Status: Decided
- Affects: `trust/privacy-export-and-erasure`, `docs/api-contracts.md` §5.8, `docs/auth-and-access-control.md`

### D-87: Reports live in one flat table with four target kinds

- Date: 2026-11-10
- Decision: `reports` stores `reporter_user_id`, `target_kind` (`USER`, `MESSAGE`, `PROFILE`, `OUTCOME`), `target_id`, a fixed-set `reason`, optional `details` (1 to 2000 characters), `status` (`OPEN`, `RESOLVED`, `DISMISSED`), and the resolution fields. `target_id` is `text` because a user id is text and the other three are uuids, so visibility is verified per kind in the service (the same participant and ACTIVE rules the read routes use) and a target the reporter cannot see answers `404`. One queue page and one resolution route serve all four kinds. No case object, no assignment, no SLA, no appeal history — that is DEBT-28.
- Reason: four target kinds share one queue and one decision; four tables would mean four queue pages, and four nullable foreign keys would mean four partial indexes and a check that exactly one is set.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/data-model.md`, `docs/known-debt.md` (DEBT-28)

### D-88: Sanctions are suspend-only, with a stored end date that never lifts itself

- Date: 2026-11-10
- Decision: The only sanction is suspension (`POST /v1/admin/accounts/{id}/suspend`) with a required reason and an optional `end_date`. One transaction sets `users.status = SUSPENDED`, stores `suspended_until`, deletes every session row, appends one `ACCOUNT_SUSPENDED` audit entry carrying the reason and the date, and queues one notice email with the reason and the date. There is no warn state, no remove state, and no automatic reinstatement: the column is stored, shown in the admin page, and audited, and lifting a suspension needs SQL (DEBT-40).
- Reason: a warning is an email rather than a state, removal is deletion (owned by `privacy-export-and-erasure`), and lifting a sanction is a decision a single reviewer makes, not a timer.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/functional-requirements.md` FR-ADM-05, `docs/data-model.md`, `docs/known-debt.md`

### D-89: DEBT-09 is closed by a post-session status re-check

- Date: 2026-11-10
- Decision: `signIn()` re-reads the account status after the identity library issued the session and, for every non-`ACTIVE` status, revokes the just-issued session and throws the same refusal the library hook would have thrown. The status predicate is one exported pure function with a table-driven test over every `accountStatus` value. The suspension transaction was already atomic and is not what the debt described. Honest limit: the interleaving itself is not staged in a test, because the library owns its own connection and insert.
- Reason: the seam is a re-check, not a shared transaction; the library inserts the session outside any transaction the API can join.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `identity/account-status-lifecycle` (no text change), `docs/known-debt.md` (DEBT-09)

### D-90: Admin notices reuse the outbox with two new templates

- Date: 2026-11-10
- Decision: `account-suspended` (to the suspended account: the reason and the end date if any, no reporter) and `report-resolved` (to the reporter: resolved, the decision, no sanction detail) are written as `EmailRequested` outbox rows in the same transaction as their action. Dedupe keys are `<user>:<request_id>` and the report id, so a retried request sends once.
- Reason: FR-NOT-01 requires one queued email per state change with retry, and the two recipients must not receive each other's facts.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/api-contracts.md` §5.9, `docs/functional-requirements.md` FR-NOT-01

### D-91: Matching ships three of the four documented factors

- Date: 2026-11-11
- Decision: Field overlap (weight 30), alumni connection (weight 30) and availability match (weight 15) are live. GoalAlignment (weight 25) is permanently missing because neither side stores a structured goal type, so `docs/matching-algorithm-spec.md` §6.3's missing-factor exclusion and renormalization apply and `limited_information` is true whenever a factor is excluded. Alumni connection scores 1.0 only when the institution, the department (both recorded, case-insensitive) and a batch year inside the configured distance all match; 0.5 for the same institution and department with a batch year outside it or unrecorded; 0 otherwise, including an unrecorded department.
- Reason: a fourth factor would need one migration, two verbatim `MODIFIED` requirement blocks, two form changes and two contract updates, and it would still ship an unvalidated factor.
- Status: Decided
- Affects: `matching/mentor-suggestions`, `docs/matching-algorithm-spec.md` §12.1, `docs/known-debt.md` (DEBT-41)

### D-92: Suggestions are a new student-only route and a new capability

- Date: 2026-11-11
- Decision: Suggestions are `GET /v1/suggestions` in a new `services/api/src/matching/` module and a new `matching/mentor-suggestions` capability. `requireRole(identity, request, "STUDENT")` gates it, and an account without the student role answers `403 ROLE_REQUIRED`. Because registration grants `STUDENT` to every account, the only caller that can hold the mentor role alone is one whose student role was revoked, which is how the integration test builds it. The directory endpoint and its payload are untouched.
- Reason: ranking the directory through a query flag would force a `MODIFIED` delta on `profiles/mentor-directory` and put two payload shapes behind one path.
- Status: Decided
- Affects: `matching/mentor-suggestions`, `docs/api-contracts.md` §5.3, `packages/contracts/openapi.yaml`

### D-93: The availability filter lives in suggestions only

- Date: 2026-11-11
- Decision: The availability factor is applied by the ranked read. `DEBT-26` is re-pointed: its suggestions half closes with this change, its directory half stays open.
- Reason: the suggested set is the ranked view; the directory keeps its keyset contract and its scan cap.
- Status: Decided
- Affects: `docs/known-debt.md` (DEBT-26)

### D-94: Availability is compared in wall-clock minutes, and mixed zones make the factor missing

- Date: 2026-11-11
- Decision: `AvailabilityMatch` is overlapping minutes over the smaller side's total minutes, capped at 1.0. Windows declared in more than one time zone make the factor missing rather than converted. A `shortcut:` comment in `packages/domain/src/match.ts` records the limit.
- Reason: the pilot population is single-country (P6), and correct conversion needs a reference week and offset-change handling for a gain no pilot user can observe.
- Status: Decided
- Affects: `docs/matching-algorithm-spec.md` §12.1, `docs/known-debt.md` (DEBT-43), `packages/domain/src/match.ts`

### D-95: Match weights and the batch distance are constants in `@connect/config`

- Date: 2026-11-11
- Decision: `MATCH_FACTOR_WEIGHTS` (alumni 30, field 30, goal 25, availability 15) and `MATCH_ALUMNI_BATCH_DISTANCE` (**0**) live in `@connect/config`, not in a versioned configuration table. `packages/domain` gains a workspace dependency on `@connect/config` so the pure rule reads those constants instead of re-declaring them. The batch distance is a `MATH-FLAG`: `docs/matching-algorithm-spec.md` §12's illustrative config says 3, the owner confirmed 0 for this release, and DEBT-44 owns the confirmation.
- Reason: `FR-ADM-07` versioned configuration is unbuilt (`DEBT-31`), and the reputation weights already ship as labelled constants.
- Status: Decided
- Affects: `packages/config/src/index.ts`, `packages/domain/package.json`, `docs/matching-algorithm-spec.md` §12.1, `docs/known-debt.md` (DEBT-44)

### D-96: Suggestion event logging is deferred

- Date: 2026-11-11
- Decision: Nothing is written when a suggestion is shown, opened or chosen; the read stays read-only.
- Reason: it is a new append-only table with its grant, its probe row and a write path on a read endpoint, and no consumer exists before the weights are tuned.
- Status: Decided
- Affects: `docs/known-debt.md` (DEBT-42), `docs/matching-algorithm-spec.md` §12.1, `docs/functional-requirements.md` (FR-DISC-04 stays unbuilt)

### D-97: A checked-in seed and a platform-admin grant route break the first-admin loop

- Date: 2026-11-11
- Decision: The dev seed creates one `PLATFORM_ADMIN` and one `INSTITUTION_ADMIN` on the reserved `example.com` domain, each with a generated password printed once and an `accounts` row hashed by the library's own `hashPassword`, and it refuses to run when `NODE_ENV=production`. Separately, `POST /v1/admin/institutions/{id}/admins` lets a platform admin with an enrolled second factor grant `INSTITUTION_ADMIN` for one named institution to an account named by email. Both paths are idempotent.
- Reason: a grant needs a first actor and a redeploy per grant is what DEBT-19 recorded; the seed breaks the loop once and the route removes the redeploy.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/local-setup.md`, `AGENTS.md` rule 12 (D-103), `docs/known-debt.md` (DEBT-19 and DEBT-35 closed, DEBT-46 opened)

### D-98: Institution routes share one scoped helper

- Date: 2026-11-11
- Decision: `requireInstitutionAdmin(identity, request)` returns the account, its roles and the institution ids it administers, refuses `403 ROLE_REQUIRED` when the account holds no active `INSTITUTION_ADMIN` row for any institution, and refuses `403 MFA_REQUIRED` without an enrolled second factor. `IdentityService` gains `listInstitutionAdminScopes(userId)` so role data stays inside the identity module.
- Reason: one place decides the scope rule, and the role is read from the database on every request as every other route does.
- Status: Decided
- Affects: `services/api/src/authorization/authorize.ts`, `packages/domain/src/identity.ts`, `docs/auth-and-access-control.md`

### D-99: Verification writes the full attestation and revokes the earlier verified row

- Date: 2026-11-11
- Decision: Verification sets `status` verified, `level` level 1, `method` admin attestation, `decided_by_user_id`, `decision_reason` and `verified_at`, revokes any other `VERIFIED` affiliation of the same account inside the same transaction, appends one audit entry, queues one `affiliation-decided` notice naming the institution and the decision only, and re-runs `syncMentorActivation`. Rejection sets `status` rejected with the reason and grants no level.
- Reason: `affiliations_one_verified_unique` makes the revocation mandatory rather than optional, and a mentor must not stay pending after being verified.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/data-model.md`, `docs/api-contracts.md` §5.2

### D-100: Three routes, and only one under `/v1/admin`

- Date: 2026-11-11
- Decision: `GET /v1/institution/affiliations`, `POST /v1/institution/affiliations/{id}/decide` with `decision` and a required `reason`, and `POST /v1/admin/institutions/{id}/admins` whose body names the target by `email`.
- Reason: the actor owns the path name, and an admin can discover an email but not an account id.
- Status: Decided
- Affects: `packages/contracts/openapi.yaml`, `packages/contracts/src/body-keys.ts`, `docs/api-contracts.md` §5.2

### D-101: The reviewer sees the claim, not the profile

- Date: 2026-11-11
- Decision: A queue entry carries the claim id, the applicant's display name, the email **domain only** (`split_part(email, '@', 2)` in SQL), the claim kind, department, program, batch year and the claim timestamp. No biography, goal, availability, capacity, account id or email local part is exposed.
- Reason: FR-PROF-04 keeps a student's profile from an institution admin without consent, and an attestation does not need it.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/auth-and-access-control.md`

### D-102: A decision is conditional, single, and never on one's own claim

- Date: 2026-11-11
- Decision: The update is `WHERE id = ... AND status = 'PENDING'`; a zero-row match answers `409 CLAIM_ALREADY_DECIDED` and rolls the whole transaction back, so no revoke, audit row or email remains. A claim created by the acting account is refused `403 FORBIDDEN` before any write, and a claim outside the caller's scope answers `404`.
- Reason: the conditional update removes the two-reviewer race, and self-decision has no legitimate reading.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `docs/api-contracts.md` §5.2

### D-103: `AGENTS.md` rule 12 is narrowed, not broken

- Date: 2026-11-11
- Decision: Rule 12 now reads: no route grants `PLATFORM_ADMIN`; the hand-run `INSERT` in `docs/local-setup.md` stays the pilot path; the checked-in dev seed is the only script allowed to create a `PLATFORM_ADMIN` or an `INSTITUTION_ADMIN`, only on the reserved `example.com` demo accounts, with a once-printed generated password, and it refuses to run when `NODE_ENV=production`. Every admin route still requires an enrolled second factor.
- Reason: the rule and the new seed would otherwise contradict each other in the same commit, and a rule that is quietly broken is worse than a rule that is explicitly narrowed.
- Status: Decided
- Affects: `AGENTS.md`, `docs/local-setup.md`, `services/api/src/db/seed/admins.ts`, `docs/known-debt.md` (DEBT-46)

### D-104: The request draft lives in `localStorage`, one key per mentor

- Date: 2026-11-11
- Decision: `apps/web/lib/request-draft.ts` stores the six form values under `connect:request-draft:<mentorProfileId>`, never a token, a password or an email. Every storage call is wrapped, so an absent, throwing or full store reads as "no draft" and never blocks a send.
- Reason: it survives a tab close, which is the failure this fixes, and it needs no new dependency; the identity spec's "no token in browser storage" rule stays true because no credential is written.
- Status: Decided
- Affects: `mentorship/request-lifecycle` (ADDED requirement), `apps/web/lib/request-draft.ts`, `docs/known-debt.md` (DEBT-49)

### D-105: A draft expires twenty-four hours after its last write

- Date: 2026-11-11
- Decision: The stored entry carries `savedAt`; a read older than `DRAFT_TTL_MS` ignores the values and removes the entry. A malformed entry is removed rather than repaired.
- Reason: a week-old half-written request would resurface against a mentor whose context has changed, and the loss it prevents is minutes of typing.
- Status: Decided
- Affects: `mentorship/request-lifecycle`, `apps/web/lib/request-draft.ts`

### D-106: Every draft is cleared at both sign-out call sites

- Date: 2026-11-11
- Decision: `clearAllDrafts()` runs in `apps/web/app/session-nav.tsx` after the header sign-out and in `apps/web/app/account/sessions/page.tsx` after sign-out-everywhere, before the redirect in both cases.
- Reason: personal text on a shared device must not survive a deliberate sign-out, and the second call site would otherwise be missed by a rule that only names "the sign-out path".
- Status: Decided
- Affects: `apps/web/app/session-nav.tsx`, `apps/web/app/account/sessions/page.tsx`, `mentorship/request-lifecycle`

### D-107: No service worker and no offline cache (owner decision)

- Date: 2026-11-11
- Decision: The installable-web-app work ships a manifest, icons, and metadata only: no service worker, no offline cache, no custom install prompt. Offline behaviour stays with `FR-UX-02`.
- Reason: the framework documentation lists a valid manifest plus HTTPS as the install criteria and does not list a service worker; an offline cache is a retention and privacy decision on a shared device, not a side effect of installability.
- Status: Decided
- Affects: `experience/installable-pwa`, `docs/known-debt.md` (DEBT-37 narrowed)

### D-108: Icons are rendered from the existing brand mark, flat tiles if none exists (owner decision)

- Date: 2026-11-11
- Decision: The three icons (192, 512, 512 maskable) are rendered from the existing brand mark by a one-off local command and committed as PNGs; if no mark exists in the tree, flat colour tiles ship instead and the handoff says so. No dependency and no build step are added.
- Reason: installability needs real icon files at the declared sizes, and a generated icon route would add a rendering surface for a static asset.
- Status: Decided
- Affects: `experience/installable-pwa`, `apps/web/public/`

### D-125: The install colours are one constant, chosen because the app has no palette

- Date: 2026-11-12
- Decision: `apps/web/app/manifest.ts` exports `manifestColors` with `background: #ffffff` and `theme: #0f172a`; the manifest's `background_color` and `theme_color`, the flat icon tiles, and the layout's `viewport.themeColor` all read it. The tiles themselves are that theme colour.
- Reason: `apps/web` ships no stylesheet and no palette file, so there was no existing token to reuse and inventing a brand palette is not this change's business; one constant keeps the manifest, the icons and the browser chrome from drifting, and a real palette replaces it in one edit when one exists.
- Status: Decided
- Affects: `experience/installable-pwa`, `apps/web/app/manifest.ts`, `apps/web/app/layout.tsx`, `apps/web/public/`

### D-109: Institution creation stops at the institution

- Date: 2026-11-11
- Decision: `POST /v1/institutions` creates the institution and its domains only. The institution admin is assigned afterwards through the existing `POST /v1/admin/institutions/{id}/admins`, which this change does not modify.
- Reason: one route, one failure mode, no partial-failure rule for "institution created, admin not found".
- Status: Decided
- Affects: `institutions/onboarding`, `docs/api-contracts.md` section 5.7

### D-110: Name, kind and country code are required; MoU date and domains are optional

- Date: 2026-11-11
- Decision: `name`, `kind` and `country_code` are required; `mou_signed_on` and `domains` are optional and labelled optional in the page. `min_cohort_size` is not in the body and stays null, so the suppression threshold remains 5.
- Reason: the required trio is the set of non-null columns, and a partner can be registered before the MoU is signed or the domains are known.
- Status: Decided
- Affects: `institutions/onboarding`, `packages/contracts/openapi.yaml`

### D-111: The institution resource lives at `/v1/institutions`

- Date: 2026-11-11
- Decision: The institution resource lives at `/v1/institutions` for both the create and the list, guarded by `PLATFORM_ADMIN` with an enrolled second factor, rather than under `/v1/admin`.
- Reason: the actor owns the path name, as it does for `/v1/institution/...`; `/v1/admin` would misname a resource later reads may share.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/auth-and-access-control.md`

### D-112: No pagination on the institution list for the pilot

- Date: 2026-11-11
- Decision: `GET /v1/institutions` returns every institution in one response with no pagination for the pilot, and the bound is recorded as debt.
- Reason: the pilot has one partner, and a cursor would add a second query shape and a second web state for a list that fits on one screen.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/known-debt.md` (DEBT-51)

### D-113: The kind is the existing enum and a duplicate domain is a 409

- Date: 2026-11-11
- Decision: `kind` is validated against the existing `institution_kind` enum values, and a domain that already exists in any letter case answers `409 INSTITUTION_DOMAIN_TAKEN` with the whole transaction rolled back. Domains are stored lower-cased.
- Reason: a free-text kind would fragment the taxonomy the dashboard groups by, and two institutions claiming one domain would make Level 1 matching arbitrary.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/data-model.md`

### D-114: Response reliability is all-time and the window is an argument

- Date: 2026-11-11
- Decision: Response reliability counts every request the mentor has ever received, with no rolling window, and the pure function takes the window as an argument so no clock and no constant live inside it.
- Reason: a rolling window needs a clock parameter and an empty-window rule for no gain at pilot scale, and one source for the 48-hour value is what keeps the sweeper and this computation in step.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `services/api/src/reputation/`

### D-115: The two counts are visible on the own impact read only

- Date: 2026-11-11
- Decision: The two request counts appear on `GET /v1/me/impact` only. `GET /v1/mentors/{id}/impact` and every directory card keep their current payload.
- Reason: a public response rate is a reputation signal the policy does not authorise, and the own-impact view is where the mentor's own behaviour belongs.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `packages/contracts/openapi.yaml`

### D-116: Counts only, never a percentage

- Date: 2026-11-11
- Decision: The payload carries two integer counts, `requests_decided_in_time` and `requests_late_or_expired`, and no percentage, score, points, tier or ranking key. The share is derivable and the docs say so in words.
- Reason: the impact view model is frozen against anything that reads as a score or a percentage (design D8), and `FR-REP-05` forbids a cross-field aggregate.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `apps/web/lib/impact-view.ts`, `docs/api-contracts.md`

### D-117: Below three requests the view shows a not-enough-data line

- Date: 2026-11-11
- Decision: Below three requests the impact section shows a single not-enough-data line instead of the two counts. The threshold is one constant in `packages/config` (`IMPACT_RELIABILITY_MIN_SAMPLE`, proposed default 3).
- Reason: a ratio over one or two requests reads as a judgement on no evidence, and the threshold is a tuning value, not code.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `packages/config/src/index.ts`, `apps/web/lib/impact-view.ts`

### D-118: A second named throttler keys on the account

- Date: 2026-11-11
- Decision: A second named throttler `account` is registered beside `default`. Sign-in takes 10 per hour per account, password reset and forgot-password take 5 per hour per account, registration takes none, and the module-level default is 120 per minute. No existing limit value changes.
- Reason: the spec already promised a per-account key and only the address half was built; mirroring the per-IP numbers per account would double an attacker's allowance for one account.
- Status: Decided
- Affects: `platform/rate-limits`, `packages/config/src/index.ts`, `services/api/src/app.module.ts`

### D-119: The account key is a hash, resolved in a fixed order

- Date: 2026-11-11
- Decision: The account key is derived in a fixed order: a hash of the normalised body email, then a hash of a present session credential, then the client address. A request with no derivable account key falls back to the address bucket and never errors, and no key ever contains a raw email address.
- Reason: the credential routes are where the attack happens and they carry an email; hashing keeps personal data out of a key that can surface in headers, and a fallback keeps anonymous routes working.
- Status: Decided
- Affects: `platform/rate-limits`, `services/api/src/app.module.ts`, `docs/api-contracts.md` section 9

### D-120: The break-glass read is a POST with a required reason

- Date: 2026-11-11
- Decision: The break-glass read is `POST /v1/admin/mentorships/{id}/break-glass-read` with a required `reason` of 1 to 1000 characters in the body. A GET with the reason in the query string is rejected.
- Reason: the call writes an audit row, so it is a state change, and a reason in a URL leaks a moderator's free text into access and proxy logs.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `packages/contracts/openapi.yaml`, `docs/api-contracts.md` section 5.5

### D-121: The actor, the order and the refusals

- Date: 2026-11-11
- Decision: The actor is `PLATFORM_ADMIN` with an enrolled second factor. The order is authorize, validate, resolve, write the audit row, read, respond. A missing or empty reason is `422` with no audit row and no content; a non-admin is `403`; an admin without a second factor is refused before any write; an unknown mentorship is `404` with no audit row; the participant read is unchanged.
- Reason: a moderation read must leave a record before it discloses anything, and each refusal has to be distinguishable from the others in a test.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/auth-and-access-control.md`, `docs/security-requirements.md`

### D-122: Messages plus the agreement and the sessions, never outcome text

- Date: 2026-11-11
- Decision: The read returns the thread messages oldest first plus the agreement and the session records, using the participant read's own projection. Outcome text, profile text and email addresses are never returned.
- Reason: a reviewer needs the session a report is about, and needs nothing beyond what the requirement authorises.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/api-contracts.md` section 5.5

### D-123: No participant notification; the audit row is the record

- Date: 2026-11-11
- Decision: Participants are not notified that their thread was read; the audit row is the record, and a debt row (DEBT-52) holds the disclosure decision open.
- Reason: notification is the more defensible product long term but `FR-NOT-01` does not list it as a trigger and it needs its own template and its own decision about disclosing moderator activity.
- Status: Decided
- Affects: `mentorship/thread-and-sessions`, `docs/known-debt.md` (DEBT-52)

### D-124: No migration, one new action member

- Date: 2026-11-11
- Decision: No migration. `audit_logs.action` is plain text and `break_glass` and `reason` already exist, so the audit write is schema-complete; `AuditAction` gains `THREAD_BREAK_GLASS_READ`.
- Reason: a separate reads table would duplicate what the audit log already records, and a column that exists does not need creating.
- Status: Decided
- Affects: `services/api/src/identity/audit-log.ts`, `docs/data-model.md`

### D-126: The register is harmonised with the decisions already recorded

- Date: 2026-11-12
- Decision: The register is harmonised with recorded decisions: `FR-OUT-07` becomes Tier 0 only (DEBT-22), `FR-PRIV-01` becomes the synchronous JSON export (D-84), `FR-REP-02` becomes counts plus response reliability with the confidence tier deferred (D-67, DEBT-24); `FR-OUT-09`, `FR-OUT-10`, `FR-NOT-01` and `FR-AUD-01` are annotated as built where the code exists, and `FR-PRIV-03` is left untouched. `docs/mvp-build-plan.md` section 1.1 now lists the register's Must ids one per area, and section 1.2 drops `FR-PRIV-03` and `FR-INST-01`, which the register marks Must.
- Reason: the register is the pilot gate's scoreboard; five rows no longer described what the owner decided or what the code does, two status blocks contradicted themselves and the build plan carried a different Must set. The register may not be lowered to reach a number, so every amendment names the decision that narrowed it and every annotation names the symbol that proves it.
- Status: Decided
- Affects: `docs/functional-requirements.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`, `docs/audit/08-resolution-report.md`

### D-127: The agreements and the orientation are part of the activation gate, and the orientation is a column

- Date: 2026-11-13
- Decision: `mentorActivation` in `packages/domain` takes `hasVolunteerAgreement`, `hasCommunityGuidelines` and `orientationCompleted` and reaches `ACTIVE` only with Level 1, an enrolled second factor and all three. The orientation is `mentor_profiles.orientation_completed_at` plus one `ORIENTATION_COMPLETED` audit row written by the request that accepts the volunteer agreement, never a sixth consent purpose, and it is never withdrawable.
- Reason: FR-PROF-03 names the agreements and the orientation, and the predicate was enforcing only two of the four conditions. A consent purpose for the orientation would need an enum migration and would let a user "withdraw" something that has no withdrawal meaning.
- Status: Decided
- Affects: `profiles/mentor-onboarding`, `trust/consent-purposes`, `packages/domain/src/mentor-onboarding.ts`, `services/api/src/onboarding/mentor-activation.ts`, `docs/data-model.md`

### D-128: One signed-in consent route pair serves all five purposes

- Date: 2026-11-13
- Decision: `GET /v1/me/consents` returns every purpose with `current_version`, `accepted_version`, `action` and `institution_id`, plus the caller's institutions; `POST /v1/me/consents` takes `purpose`, `action`, `document_version` and an optional `institution_id`, appends one `consent_records` row and one audit row in one transaction, and requires `institution_id` only for `INSTITUTION_DATA_SHARING`. The purpose enum is the only source of valid values; no enum value is added.
- Reason: five bespoke routes would multiply the four hand-maintained route registries by five for one behaviour, and the enum already holds every purpose.
- Status: Decided
- Affects: `trust/consent-purposes`, `packages/contracts/openapi.yaml`, `packages/contracts/src/body-keys.ts`, `docs/api-contracts.md`

### D-129: Re-acceptance is a banner, never a refusal

- Date: 2026-11-13
- Decision: `GET /v1/me/consents` reports the published version beside the accepted one, and the app header renders a link to `/consent` when they differ. No route refuses a request because a document version is stale.
- Reason: a middleware that blocked writes until re-acceptance would lock a pilot user out of the product over a document edit, which the requirement does not ask for and which would produce a support incident; the signal is enough to drive re-acceptance without one.
- Status: Decided
- Affects: `trust/consent-purposes`, `apps/web/app/session-nav.tsx`, `apps/web/lib/consents.ts`

### D-130: No backfill, and accepting a document re-runs the activation funnel

- Date: 2026-11-13
- Decision: Migration `0018` adds a nullable column and writes no consent record; an already-`ACTIVE` mentor profile keeps its status until its next re-evaluation, when a profile without the agreements returns to `PENDING`. A `POST /v1/me/consents` for a mentor purpose calls `syncMentorActivation` in the same transaction.
- Reason: a backfill would write consent records nobody gave, which is the one thing an append-only consent table must never contain; without the funnel call an accepted agreement would wait for an unrelated trigger before it could activate the profile.
- Status: Decided
- Affects: `trust/consent-purposes`, `services/api/drizzle/0018_many_gabe_jones.sql`, `services/api/src/consent/drizzle-consent.service.ts`
