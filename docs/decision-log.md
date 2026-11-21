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

### D-131: The API sends a strict header set through helmet, one module, every environment

- Date: 2026-11-13
- Decision: `services/api/src/http/security-headers.ts` exports the helmet options and `main.ts` applies them before the body parser. The policy is `default-src 'none'` with script, frame, form, base and object sources forbidden; HSTS, nosniff, `no-referrer`, `DENY`, CORP and COOP are on and `X-Powered-By` is off. The set is the same in every environment.
- Reason: the API serves JSON to the BFF and never a document, so it needs no script, frame or form source at all; one module keeps the tests reading the same values the app sends, and applying it before the body parser is what makes a refused body carry the headers too.
- Status: Decided
- Affects: `platform/http-security-controls`, `services/api/src/http/security-headers.ts`, `docs/security-requirements.md`

### D-132: No CORS allowlist, because the browser never calls the API

- Date: 2026-11-13
- Decision: `enableCors` is not called. Every browser request goes through the web BFF, which calls the API server-side, so the absence of a cross-origin allow header is the restriction rather than a missing feature.
- Reason: an allowlist with no legitimate origin in it is a fiction that reads as protection; an empty one states the truth and fails the build if someone enables CORS without a decision.
- Status: Decided
- Affects: `platform/http-security-controls`, `services/api/src/main.ts`, `docs/api-contracts.md`

### D-133: The web CSP ships report-only, enforcement is its own change

- Date: 2026-11-13
- Decision: `apps/web/lib/security-headers.ts` sends `Content-Security-Policy-Report-Only` on every path, with the eight directives the app actually uses; no enforcing policy header is sent.
- Reason: Next injects an inline bootstrap and the Google callback relay is a redirect chain nobody has exercised against a policy; enforcing it without reading real violations first would be a guess with a sign-in outage behind it. DEBT-56 holds the step.
- Status: Decided
- Affects: `platform/http-security-controls`, `apps/web/next.config.ts`, `apps/web/lib/security-headers.ts`

### D-134: No CSRF token this round; DEBT-03 stays open

- Date: 2026-11-13
- Decision: `SameSite=Lax` remains the pilot boundary for cookie-authenticated writes. No token, no double-submit cookie, no origin check is added.
- Reason: the pilot has one first-party client and the cookie is `Lax` on every write route; a token needs a page-side change on eleven forms and a decision about the API's own clients, and neither exists yet.
- Status: Decided
- Affects: `platform/http-security-controls`, `docs/known-debt.md`

### D-135: The audit read is one GET with six filters and a keyset cursor

- Date: 2026-11-13
- Decision: `GET /v1/admin/audit` takes optional `actor`, `action`, `object_type`, `object_id`, `from` and `to` (ANDed, UTC days, inclusive), orders by `occurred_at` descending then `id` descending, and pages with a keyset cursor built from the last row's `(occurred_at, id)` pair. `limit` is 1 to 100 with a default of 50. An unknown `action` or `object_type`, an `actor` with characters outside `[A-Za-z0-9_-]`, an unparseable date, `from` later than `to` or an out-of-range `limit` is `422` naming the parameter. `object_type` is matched exactly against the values the writers store, which include upper-case ones (`AFFILIATION`, `CONSENT_RECORD`), so the index leads with the column and the admin page sends the value it was given.
- Reason: offset pagination drifts as rows are appended and a POST search body would put filters where the body allowlist has to grow; a typo that returns an empty page would hide itself in an incident review, which is why an unknown value is refused instead.
- Status: Decided
- Affects: `trust/audit-log-inspection`, `packages/contracts/openapi.yaml`, `docs/api-contracts.md`, `services/api/src/audit/audit.controller.ts`

### D-136: The projection is the row minus metadata, prev_hash and hash

- Date: 2026-11-13
- Decision: The read returns `id`, `occurred_at`, `actor_user_id`, `actor_role`, `action`, `object_type`, `object_id`, `request_id`, `break_glass` and `reason`. `metadata`, `prev_hash` and `hash` are not in the select at all, so a writer that adds a key to `metadata` cannot widen the payload. `reason` is returned because the audit row states it and the suspension and report paths already put it on the record.
- Reason: `metadata` can hold free text no requirement authorises disclosing, and the hash chain is an integrity device for the database, not for a browser. Freezing the key set in a test keeps the payload from drifting as writers change.
- Status: Decided
- Affects: `trust/audit-log-inspection`, `packages/contracts/openapi.yaml`, `services/api/src/audit/drizzle-audit.service.ts`

### D-137: Reading the audit log is not itself audited

- Date: 2026-11-13
- Decision: `GET /v1/admin/audit` writes no audit row and no `AUDIT_LOG_READ` action is added to the union.
- Reason: a row per read would let a reader inflate the table they are reviewing and would put a write on a route whose value is that it is a pure read. The consequence — a reviewer's reading is not itself on the record — is stated in the capability and in the register's annotation, and the test asserts that two reads change no row count.
- Status: Decided
- Affects: `trust/audit-log-inspection`, `docs/functional-requirements.md`

### D-138: No index for the action filter; DEBT-58 records the bound

- Date: 2026-11-13
- Decision: The two existing indexes cover the actor and object filters; the `action` filter scans. A `shortcut:` comment in the service and DEBT-58 state that `audit_logs(action, occurred_at)` is added when the table passes roughly a million rows.
- Reason: the filter is used in incident review, not on a hot path, and an extra index on an insert-only table costs every write; the pilot's table holds thousands of rows.
- Status: Decided
- Affects: `docs/known-debt.md`, `services/api/src/audit/drizzle-audit.service.ts`

### D-139: A warning is an audit fact, and its count is derived

- Date: 2026-11-13
- Decision: `POST /v1/admin/accounts/{id}/warn` appends one `ACCOUNT_WARNED` audit entry (the admin, the account, the reason) and queues one `account-warned` notice in the same transaction; it changes no status, no end date and no session. The warning count is a grouped count over those rows, exposed to the admin queue as `warning_count` and to the warned account nowhere.
- Reason: a `users.warning_count` column would be a second source of truth for a number the append-only log already holds, and it would need a migration and a backfill. Keeping the count off the account's own reads is deliberate: the spec warns the account without telling it how many times it has been warned, which is a moderation detail.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/api-contracts.md`, `services/api/src/reports/drizzle-reports.service.ts`

### D-140: One `liftSuspension` serves the route and the job

- Date: 2026-11-13
- Decision: `POST /v1/admin/accounts/{id}/reinstate` and the scheduled sweep both call one service method that performs a single conditional `UPDATE users ... WHERE id = $1 AND status = 'SUSPENDED'`, clears `suspended_until`, appends one `ACCOUNT_REINSTATED` row and queues one `account-reinstated` notice in one transaction. A zero-row update is `409 ACCOUNT_NOT_SUSPENDED` on the route and a no-op in the job.
- Reason: two implementations is how a route and a job drift until one of them skips the notice, and a read-then-write loses to a concurrent suspension. The conditional update makes exactly one of the two writes apply.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/api-contracts.md`, `services/api/src/reports/drizzle-reports.service.ts`

### D-141: The route lifts an indefinite suspension; the job never does

- Date: 2026-11-13
- Decision: The route lifts any `SUSPENDED` account with a reason. The sweep selects only rows whose `suspended_until` is set and at or before its own instant, so a suspension with no end date is permanent until an admin lifts it, and a suspension re-set with a later date survives the run.
- Reason: an admin lifting a sanction by mistake is the case the route exists for; a job that ended a permanent sanction would silently reverse an operator decision. `FR-ADM-05` is amended to warn, suspend and lift, and removal is out of the MVP by this decision.
- Status: Decided
- Affects: `trust/abuse-reports-and-sanctions`, `docs/functional-requirements.md`, `services/api/src/reports/sanction-expiry.ts`

### D-142: Removal is out of the MVP

- Date: 2026-11-13
- Decision: No `REMOVED` account status, no removal route and no removal job in the MVP. `FR-ADM-05` reads "warn, suspend, lift".
- Reason: removal has no consumer in a one-partner pilot, and an irreversible account action needs a written policy and an appeal path the MVP does not have.
- Status: Decided
- Affects: `docs/functional-requirements.md`, `docs/known-debt.md`

### D-143: The availability filter compares UTC instants on the request's own week

- Date: 2026-11-13
- Decision: `GET /v1/mentors` takes `available_weekday` (1 to 7, Monday-based), `available_start` and `available_end` (minute of day) and `available_timezone` (an IANA zone), all four together or none. Both sides are converted to UTC on the ISO week that contains the request instant, and a mentor matches when its stored window overlaps the requested one as instants.
- Reason: comparing wall-clock minutes across zones is the bug DEBT-43 records; converting both sides is the only comparison that answers "who is free at that time". All-or-nothing keeps a partial filter from silently returning the whole directory.
- Status: Decided
- Affects: `profiles/mentor-directory`, `packages/contracts/openapi.yaml`, `docs/api-contracts.md`

### D-144: One pure conversion in the domain package mirrors the SQL

- Date: 2026-11-13
- Decision: `packages/domain/src/availability.ts` exports `zonedWindowToUtc`, `weekAnchor`, `overlaps` and `isKnownTimeZone`, using only `Intl`; the SQL predicate converts each stored row with `... AT TIME ZONE aw.timezone` on the same Monday anchor. The viewer's interval is computed once in the controller from the same helper, so the two cannot drift.
- Reason: a fixed-offset table breaks on any zone with daylight saving, and two independent implementations would disagree at a transition. A DST week is a test case, not an assumption.
- Status: Decided
- Affects: `profiles/mentor-directory`, `packages/domain/src/availability.ts`, `services/api/src/profiles/drizzle-profiles.service.ts`

### D-145: Overlap matches, and a zone whose offset shifts mid-week is a recorded limit

- Date: 2026-11-13
- Decision: Overlap, not containment, decides a match. A window whose UTC interval straddles midnight is one interval, not two. The residual error — a zone whose offset changes inside the reference week — is a `shortcut:` comment beside the helper and narrows DEBT-43 rather than closing it.
- Reason: a mentor free for part of the requested time is still requestable, and interval comparison already handles a straddling window without a duplicated adjacent weekday.
- Status: Decided
- Affects: `docs/known-debt.md`, `docs/matching-algorithm-spec.md`

### D-146: One status marker per Must row, and a score anyone can recompute

- Date: 2026-11-13
- Decision: every Must row in `docs/functional-requirements.md` ends its feedback cell with exactly one `**Status: DONE**`, `**Status: PARTIAL**` or `**Status: NOT STARTED**` marker, followed by a code path (Done) or a one-line gap (Partial). The score is DONE 1.0, PARTIAL 0.5, NOT STARTED 0.0 over the 64 rows; the code-only figure scores at 0.0 any row that reached Done only through an amendment to the register, which today is `FR-ADM-05` alone.
- Reason: the register is the gate's scoreboard, and it carried 29 unannotated rows and 9 contradictory ones, so the quoted number depended on who last edited the file. One marker in one place makes `grep -c "Status: DONE"` the score.
- Status: Decided
- Affects: `docs/functional-requirements.md` (section 0.1 legend, all 64 Must rows, section 2.16)

### D-147: Discovery requires an active account, derived on every read

- Date: 2026-11-13
- Decision: every discovery query filters on `users.status = 'ACTIVE'` in addition to the profile's own operating status: the public directory, the ranked suggestions pool, the mentor context read (`GET /v1/mentors/{id}`) and the public impact read (`GET /v1/mentors/{id}/impact`). The condition is never stored on `mentor_profiles` and no suspension rewrites that column.
- Reason: `suspendAccount` writes `users.status` only, so filtering on the profile status alone listed a suspended mentor and let a student send them new requests. Deriving the condition means one write hides the mentor and no write is needed to restore them.
- Status: Decided
- Affects: `profiles/mentor-directory`, `matching/mentor-suggestions`, `mentorship/reputation-ledger`, `services/api/src/profiles/drizzle-profiles.service.ts`, `services/api/src/reputation/drizzle-reputation.service.ts`

### D-148: A request to an inactive account is refused as unavailable

- Date: 2026-11-13
- Decision: `POST /v1/requests` answers `409 MENTOR_UNAVAILABLE` when the mentor's account status is not `ACTIVE`, the same refusal a paused mentor returns, and writes no request row and no notification. An id that names no mentor profile keeps its `422 VALIDATION_FAILED`.
- Reason: the student must not learn that a mentor was suspended, and one refusal code for every "cannot take requests now" case keeps the contract and the string catalogue unchanged.
- Status: Decided
- Affects: `mentorship/request-lifecycle`, `docs/api-contracts.md`, `services/api/src/requests/drizzle-requests.service.ts`

### D-149: A suspended mentor's existing requests and threads stay as they are

- Date: 2026-11-13
- Decision: a suspension blocks new discovery and new requests only. A request already pending keeps its status, its 48-hour window and its accept and decline paths, and existing mentorships, sessions, agreements and outcomes stay readable to both sides. The gap is recorded as DEBT-59 rather than fixed here.
- Reason: cancelling in-flight work on suspension is a policy about the 48-hour promise (`FR-REQ-04`) that the owner has not decided, and silently breaking it inside a discovery fix would be the larger change. Assertion, not preference: it is the behaviour the code has today.
- Status: Decided
- Affects: `docs/known-debt.md`, `mentorship/request-lifecycle`

### D-150: The activation sync writes conditionally on the status it read

- Date: 2026-11-13
- Decision: `syncMentorActivation` adds the status it read to its update's `WHERE`, so a suspension, a removal or any other concurrent status write is not overwritten; a skipped write is left to the next trigger, which recomputes from the row as it then is.
- Reason: the funnel read then wrote unconditionally, so an operator's suspension could be replaced by a computed `PENDING` in the window between the two statements. The condition costs nothing at the four call sites and needs no lock.
- Status: Decided
- Affects: `profiles/mentor-onboarding`, `services/api/src/onboarding/mentor-activation.ts`

### D-151: A data export writes one DATA_EXPORTED row inside its own transaction

- Date: 2026-11-14
- Decision: `exportAccount` appends one `DATA_EXPORTED` audit entry after the `privacy_requests` row and after the document's own audit section is read, with the caller as actor and object, the request identifier, and empty metadata. `PrivacyOptions` gains an optional audit-writer seam, defaulted to `appendAuditEntry`, which the deletion path uses too.
- Reason: the documented list asks for a data export to be auditable, and the export was the only privacy fact without a row. Writing it in the transaction means an export that completed is always recorded; reading the audit section first keeps the row out of the document it describes.
- Status: Decided
- Affects: `trust/privacy-export-and-erasure`, `services/api/src/privacy/drizzle-privacy.service.ts`, `docs/auth-and-access-control.md`

### D-152: A refusal on a sensitive action writes one PERMISSION_DENIED row

- Date: 2026-11-14
- Decision: `actingAccountWithRoles` notes the caller on the request, `requireRole` (and the institution-scope refusal) notes the denial only when the required role is `PLATFORM_ADMIN` or `INSTITUTION_ADMIN`, and `ProblemDetailsFilter` appends one `PERMISSION_DENIED` row for a `ROLE_REQUIRED` or `MFA_REQUIRED` error carrying that note. A refusal on an ordinary role route writes nothing. The filter holds the database, awaits the write before responding, and logs a failed write without changing the `403`.
- Reason: section 12 lists "permission denied on a sensitive action" and nothing wrote it, but recording every `403` would log routine role mistakes. The refusal path already owns the request id and the response, so the row belongs there rather than in eight controllers.
- Status: Decided
- Affects: `trust/consent-and-audit-records`, `services/api/src/http/problem-details.filter.ts`, `services/api/src/authorization/authorize.ts`

### D-153: The documented list marks what no code path emits, and the read accepts every writer action

- Date: 2026-11-14
- Decision: `docs/auth-and-access-control.md` section 12 names the documented events with no code path yet and the requirement that owns each. `FR-AUD-01` reads Done when every documented action that has a code path writes its row. `AUDIT_ACTIONS` gains `DATA_EXPORTED`, `PERMISSION_DENIED`, `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED`, so the filter accepts every action a writer emits, and still refuses an unknown value with `422`.
- Reason: a list that is ahead of the code cannot be scored; marking is honest where inventing a feature is not. The two sanction actions were already written and could not be filtered, which is the same defect in the read direction.
- Status: Decided
- Affects: `docs/auth-and-access-control.md`, `docs/functional-requirements.md`, `services/api/src/audit/audit.service.ts`

### D-154: Every controller carries the request-id middleware, and a denial row names the role it is about

- Date: 2026-11-14
- Decision: the request-id middleware applies to every controller a module registers, and a test reads `services/api/src/*/*.module.ts` against `app.module.ts` so the next omission fails the suite. A `PERMISSION_DENIED` row records the role the refusal is about when the caller holds it, and otherwise the highest role the caller does hold.
- Reason: `AuditController`, `ConsentController`, `InstitutionsController` and `AdminThreadController` were missing from the middleware list, so their responses carried no `X-Request-Id` and their audit rows could not be correlated — invisible to the suite because each test stack passes its own controller list. Separately, the first version of the denial row took `roles[0]`, which is always `STUDENT` because every account holds it, so every row misstated the actor's role.
- Status: Decided
- Affects: `services/api/src/app.module.ts`, `services/api/src/http/problem-details.filter.ts`, `services/api/test/request-id-coverage.test.ts`, `docs/auth-and-access-control.md`

### D-155: The action filter's list is derived from the union, not typed against it

- Date: 2026-11-14
- Decision: `AUDIT_ACTIONS` is derived from an exhaustive `Record<AuditAction, true>` map, so a new member of the union fails typecheck until it is listed, and the read test iterates the derived list instead of naming four literals.
- Reason: `satisfies readonly AuditAction[]` only proved that every listed value is an action, not that every action is listed — which is exactly how `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED` shipped unfilterable (D-153).
- Status: Decided
- Affects: `services/api/src/audit/audit.service.ts`, `services/api/test/audit-read.integration.test.ts`

### D-156: `FR-OUT-07` and `FR-ADM-06` reach `DONE` through an amendment that states the pilot's Tier 0 scope, not through built work

- Date: 2026-11-14
- Decision: `FR-OUT-07` reads `DONE` for the pilot scope (every MVP outcome is Tier 0 per D-64; evidence upload, the Tier 1 and Tier 2 multipliers and the evidence-file route are post-pilot, `DEBT-22`), and `FR-ADM-06` reads `DONE` for the thread half (the audited break-glass read of `FR-THR-03`), with the evidence-file half named as post-pilot and the participant-disclosure gap kept as its own line (`DEBT-52`). Both join `FR-ADM-05` in section 2.16's code-only exclusion list, so the code-only figure counts neither.
- Reason: the owner's standing deferral of evidence upload means no code can close either row, and counting an amendment as built work would inflate pilot readiness. The code-only figure therefore falls from 53.0 to 52.5 while the register rises to 55.5; both are published.
- Status: Decided
- Affects: `docs/functional-requirements.md` (2.7, 2.11, 2.16), `docs/known-debt.md`

### D-157: The local Postgres guidance becomes "a free port named by `POSTGRES_PORT`", with the Windows reserved-range check

- Date: 2026-11-14
- Decision: `docs/local-setup.md` and `.env.example` keep `55432` as the documented default but state that Windows can reserve a TCP range containing it, give the `netsh interface ipv4 show excludedportrange protocol=tcp` check, name 55405-55504 as this machine's range, and use `55400` as the worked free port. Compose publishes `${POSTGRES_PORT:-55432}`; the default value does not change and no Compose or code file changes.
- Reason: the documented port cannot bind on the owner's machine, so a local gate run silently loses its integration suite: `docker compose ps` shows the container up while no host process can connect. A check plus an example is cheaper and safer than moving a default that other machines do not need.
- Status: Decided
- Affects: `docs/local-setup.md`, `.env.example`
### D-158: The CSRF boundary is the Next BFF, not the API

- Date: 2026-11-14
- Decision: `requireCsrf` lives in `apps/web/lib/csrf.ts` and every write-capable route handler under `apps/web/app/api` calls it. The NestJS API gains nothing: no header, no `403` row, no OpenAPI change, no authorization-matrix change.
- Reason: the API's only session credential is the bearer value a route handler reads out of the session cookie, and no `/v1` route parses a cookie, so a check there would guard a credential the browser never sends it. A token row in the OpenAPI document would also be a contract lie that the parity tests accept.
- Status: Decided
- Affects: `platform/http-security-controls`, `docs/api-contracts.md` (section 1.1), `docs/auth-and-access-control.md` (section 5.1)

### D-159: The token is 32 random bytes in a readable `connect_csrf` cookie, compared to `x-csrf-token` in constant time

- Date: 2026-11-14
- Decision: `connect_csrf` is base64url of 32 random bytes, `SameSite=Lax`, `Secure` outside development, `Path=/` and **not** httpOnly, because the double-submit rule needs a value the client helper can read. The session cookie stays httpOnly. The comparison is `timingSafeEqual` behind a length check. `Origin` is authoritative when present and falls back to `Referer`; a missing header does not fail a matched pair.
- Reason: the value is unguessable and never leaves the browser, so an HMAC of the session would rotate on every session for no gain. The readable cookie is a deliberate trade, recorded here and in section 5.1.
- Status: Decided
- Affects: `apps/web/lib/csrf.ts`, `apps/web/lib/csrf-client.ts`, `docs/auth-and-access-control.md`

### D-160: Five writes are exempt, and sign-out is not one of them

- Date: 2026-11-14
- Decision: `POST /api/auth/sign-in`, `/sign-in/provider`, `/register`, `/forgot-password` and `/reset-password` run no CSRF check, because no session cookie exists to abuse at that point. `sign-out` and `sign-out-everywhere` stay guarded. The list is one exported array (`CSRF_EXEMPT_ROUTES`). The guard also passes through any request that carries no session cookie, which is what keeps the challenged sign-in step (`/api/auth/mfa/verify`, holding only the opaque challenge cookie) working while the enrollment confirmation stays guarded.
- Reason: the exemption has to be reasoned per route, not per path prefix, and a forced sign-out is a real nuisance attack rather than a convenience.
- Status: Decided
- Affects: `apps/web/lib/csrf.ts`, `apps/web/test/csrf-wiring.test.ts`, `docs/auth-and-access-control.md`

### D-161: `WEB_CSRF_MODE=off` is the documented one-deploy rollback

- Date: 2026-11-14
- Decision: the guard reads `WEB_CSRF_MODE` per request; any value other than `off` enforces. A field failure is answered by setting the variable and restarting the web container, with no code change, no migration and the cookie left to expire.
- Reason: a rollback the owner can perform in one line beats a hotfix, and a per-request read costs one string comparison.
- Status: Decided
- Affects: `apps/web/lib/csrf.ts`, `docs/local-setup.md`

### D-162: An audit hold reuses the existing `CASE_OPENED` event type and adds one audit action

- Date: 2026-11-14
- Decision: `transition("CONFIRMED", "auditHold")` returns `IN_PLATFORM_REVIEW`. `OutcomeService.hold` appends one `outcome_events` row with `event_type = CASE_OPENED` (already in the enum, so no migration) and one audit row `OUTCOME_AUDIT_HELD`, added to both the writer's `AuditAction` union and the read filter's derived `AUDIT_ACTIONS`.
- Reason: the event enum already names the fact being recorded, so a new value would be a migration for a synonym; a new audit action is the honest label, and adding it to both lists at once is what keeps `GET /v1/admin/audit` from answering `422` for a row a writer stored (D-155's shape).
- Status: Decided
- Affects: `mentorship/outcome-verification`, `packages/domain/src/outcome.ts`, `docs/data-model.md`, `docs/auth-and-access-control.md`

### D-163: The hold is a service method with no route, and `FR-ADM-03` is its first caller

- Date: 2026-11-14
- Decision: the transition ships with no controller, no OpenAPI row, no matrix row and no caller. The deliberate exception to "no policy without a consumer" (D-47) lasts one change window; `docs/known-debt.md`'s `DEBT-55` closure and the `FR-ADM-03` status line both name the sampling job as the consumer, and `FR-ADM-03` stays `NOT STARTED` because the selection itself is not built.
- Reason: the sampling change cannot be specified against a state machine that has no way into review; shipping the edge alone is smaller than shipping an unused route with it.
- Status: Decided
- Affects: `docs/known-debt.md`, `docs/functional-requirements.md`

### D-164: An audit-cleared outcome counts as `PLATFORM_DECISION` and earns no mentor reputation

- Date: 2026-11-14
- Decision: a held outcome cleared as `valid` counts with `counted_basis = PLATFORM_DECISION`, because `outcomes_counted_basis_known` allows only `MENTOR_CONFIRMED` and `PLATFORM_DECISION`, and `earnsMentorReputation` refuses mentorship reputation for a platform decision (D-63). The pilot accepts it.
- Reason: a third basis value is a schema check change plus a reputation-policy decision, both out of this change; the consequence is recorded before the sampling job ships rather than discovered after it.
- Status: Decided
- Affects: `docs/data-model.md` section 4.4, `docs/reputation-and-verification-policy.md`

### D-165: Eligibility is lost when the account holds no `VERIFIED` affiliation, evaluated after the writes

- Date: 2026-11-14
- Decision: both revocation sites call one helper at the end of their transaction. It selects any `VERIFIED` affiliation for the account and returns early when one exists; otherwise it moves every `PENDING` request of that mentor to `EXPIRED`. `claim` calls it after `syncMentorActivation`, and the attestation `verify` path calls it too, where it is a no-op by construction because the replacement row is already verified.
- Reason: "a revocation happened" cannot tell a supersede from a loss — the attestation path revokes and verifies in the same transaction and must expire nothing. Evaluating the resulting state gives the guard one meaning at both sites, and the attestation call is a live assertion of that.
- Status: Decided
- Affects: `institutions/affiliation-verification`, `mentorship/request-lifecycle`, `services/api/src/affiliations/affiliation-expiry.ts`

### D-166: `mentorship_requests.expiry_reason` distinguishes `DEADLINE` from `MENTOR_INELIGIBLE`

- Date: 2026-11-14
- Decision: a nullable `expiry_reason` on `mentorship_requests` with a check on those two values, backfilled to `DEADLINE` for the rows that already expired (migration `0019`). The 48-hour sweeper writes `DEADLINE`; the eligibility helper writes `MENTOR_INELIGIBLE`. The reliability aggregate and the pure rule both exclude the ineligible reason from "late or expired", and the pair read carries the reason.
- Reason: without it, response reliability cannot tell an expiry the mentor could not prevent from one they caused, and a revoked (not suspended) affiliation would quietly worsen a mentor's record. Inferring it from the mentor's current affiliation would rewrite history as that affiliation changes.
- Status: Decided
- Affects: `docs/data-model.md`, `docs/api-contracts.md`, `mentorship/reputation-ledger`, `packages/domain/src/reputation.ts`

### D-167: The notice reuses the `request-expired` template with reason-specific text

- Date: 2026-11-14
- Decision: one `request-expired` email per expired request, queued with the dedupe key `email:request-expired-ineligible:` followed by the request id, whose text says the mentor's affiliation could not be re-verified and links the directory. The text never names the institution or the mentor's address.
- Reason: the fact is unchanged and the template union already names it; a second template would add a union member and a subject line for no user-visible gain.
- Status: Decided
- Affects: `mentorship/request-lifecycle`, `apps/web` (no change), `docs/data-model.md`

### D-168: No audit action is added for the expiry itself

- Date: 2026-11-14
- Decision: the expiry writes no audit row. The cause is already recorded by the `AFFILIATION_REVOKED` row in the same transaction, and `FR-AUD-01`'s documented list has no request-expiry event.
- Reason: the 48-hour sweeper writes no audit row either, and inventing `REQUEST_EXPIRED` would put an action in the writer's union that no read filter names — the defect shape D-155 fixed in the other direction.
- Status: Decided
- Affects: `docs/auth-and-access-control.md` (a note, not a table row)

### D-169: The web policy enforces, and the docs say what that does not buy

- Date: 2026-11-14
- Decision: `apps/web/lib/security-headers.ts` sends the enforcing `Content-Security-Policy` on every path with the eight directives the app has reported under for a round, unchanged: `'unsafe-inline'` stays in `script-src` and `style-src`. The docs, the register row and the risk line say plainly that the gain is origin and framing restriction (no third-party script, no `<base>` rewrite, no other form target, no external frame), not injection control; a nonce or hash based `script-src` is DEBT-60.
- Reason: a year of report-only violations would have been the alternative gate, and the browser pass in change 5 — every main page, sign-in, MFA, the Google entry and callback relay, a form submit — is that gate, run once. Shipping an enforcing header while claiming more than it does would be the worse failure.
- Status: Decided
- Affects: `platform/http-security-controls`, `docs/security-requirements.md` SEC-API-3, `docs/known-debt.md` DEBT-56 and DEBT-60

### D-170: One env flag is the whole rollback, and an unknown value keeps enforcing

- Date: 2026-11-14
- Decision: `cspMode()` reads `WEB_CSP_MODE` and returns `report-only` only for that exact string; anything else — unset, empty, mistyped — enforces. `next.config.ts` asks `webSecurityHeaders()` for the mode. Next resolves `headers()` when it builds, so the flip costs a restart for a host run and a rebuild of the web image for the container; the flag is a build argument in `Dockerfile.web` and `compose.yaml` for that reason (measured: a restart alone kept the enforcing header).
- Reason: a kill switch that a typo can turn off is a liability; a kill switch that only one exact value turns off is a rollback. The CSRF change took the same shape (D-161) so operators learn one pattern, not two.
- Status: Decided
- Affects: `platform/http-security-controls`, `apps/web/next.config.ts`, `docs/local-setup.md`, `.env.example`

### D-171: The archived CSP change is archived only if the browser pass is clean

- Date: 2026-11-14
- Decision: the change is archived in the same round only after the enforcing policy was exercised in a real browser with zero `securitypolicyviolation` events across sign-in, MFA, the Google entry, a form submit and the main pages; if the pass had shown violations the change would have merged and stayed unarchived with the reasons recorded.
- Reason: an enforcing policy that breaks a page is worse than none, and the archive row is the repo's statement that the work is finished. The owner named this condition; the record makes clear it was met rather than assumed.
- Status: Decided
- Affects: `platform/http-security-controls`, `docs/mvp-build-plan.md` section 5

### D-172: The read marker lives in its own table, not on `mentorships` or `thread_messages`

- Date: 2026-11-15
- Decision: `thread_read_states` holds one row per (mentorship, user) with a unique index on the pair and a monotonic `last_read_at`. Two nullable columns on `mentorships` were rejected.
- Reason: two columns hard-code the two-party assumption into the row the capacity check locks, and give a future third participant nowhere to live. A separate table also leaves the mentorship write pattern untouched.
- Status: Decided
- Affects: `docs/data-model.md` 5.4, `services/api/src/db/schema/mentorships.ts`, migration `0020`

### D-173: One explicit mark-read route, and no read ever writes

- Date: 2026-11-15
- Decision: `POST /v1/mentorships/{id}/read` is the only writer of a marker. Marking on `GET /v1/mentorships/{id}/messages` was rejected.
- Reason: marking on a read makes the read non-idempotent, puts a write behind every page load, and forces a CSRF token and a rate-limit bucket onto a route the contract describes as a read.
- Status: Decided
- Affects: `docs/api-contracts.md` 5.5, `packages/contracts/openapi.yaml`

### D-174: The marker advances under a conditional upsert, with the database's clock

- Date: 2026-11-15
- Decision: one `INSERT ... ON CONFLICT (mentorship_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at WHERE thread_read_states.last_read_at < excluded.last_read_at`, with the instant from `now()`. No caller-supplied timestamp.
- Reason: a stale or duplicate writer cannot regress the marker, the route stays idempotent without a lock, and a client clock is attacker-controlled — a future timestamp would hide every later message.
- Status: Decided
- Affects: `services/api/src/mentorships/drizzle-mentorship.service.ts`

### D-175: `unread_count` is reported on the mentorship read and list, not on the message page

- Date: 2026-11-15
- Decision: `mentorshipPayload()` carries an optional `unread_count`, so `GET /v1/mentorships` and `GET /v1/mentorships/{id}` report it and no write response does. The message page stays a keyset page.
- Reason: a count returned with a window of 20 messages answers a different question and is wrong the moment the client pages; the participant opens the mentorship before the thread, so the count belongs there. A write does not compute a number only to omit it later.
- Status: Decided
- Affects: `docs/api-contracts.md` 5.5, `packages/contracts/openapi.yaml`

### D-176: The unread rule is a pure domain function pinned to the API's SQL

- Date: 2026-11-15
- Decision: `countUnread` in `@connect/domain` takes the messages, the viewer and the marker and returns a non-negative integer. The integration test computes it on the same rows the API answered from and asserts the two agree.
- Reason: the same pattern `responseReliability` set (D-114): the SQL stays the authority, and the pure rule cannot drift from it without a failing test.
- Status: Decided
- Affects: `packages/domain/src/mentorship.ts`, `services/api/test/mentorship.integration.test.ts`

### D-177: The marker table's grant excludes DELETE

- Date: 2026-11-15
- Decision: `GRANT SELECT, INSERT, UPDATE ON thread_read_states TO connect_app` in migration `0020`; no `DELETE`, and the database probe asserts that `connect_app` is refused one.
- Reason: a marker is removed only by the mentorship cascade. A `DELETE` grant would let a caller erase their own read history, which is the evidence of what they had not seen.
- Status: Decided
- Affects: `docs/data-model.md` INV-05 and 5.4, `services/api/test/database.integration.test.ts`

### D-178: The audit sample rate is a working value of 25%

- Date: 2026-11-15
- Decision: `AUDIT_SAMPLE_RATE = 0.25` in `@connect/config`, read by the job through the one-line `auditSampleRate()` seam. At a pilot week of about 20 confirmations this is roughly five to eight cases for the only reviewer.
- Reason: the requirement leaves the rate Open (P1) and a pilot needs a number. Single constant, read through one function, so `configuration-versioning` can replace the source without touching the job.
- Status: Decided; the value stays `Open` as a product number, and the owner can lower it before the pilot
- Affects: `packages/config/src/index.ts`, `services/api/src/outcomes/audit-sampler.ts`, `docs/reputation-and-verification-policy.md` §6

### D-179: Three outcome types are always sampled, by name

- Date: 2026-11-15
- Decision: `AUDIT_ALWAYS_SAMPLED_OUTCOME_TYPES = ["ADMISSION", "INTERNSHIP", "JOB_OFFER"]`, independent of the rate.
- Reason: every difficulty weight is a `1.0` placeholder (D-67), so "the highest difficulty band" would select everything and make the random draw meaningless. The three types are the ones the register already ties to Tier 1 (`FR-OUT-07`), so the rule has a documentary basis rather than an invented one.
- Status: Decided
- Affects: `packages/config/src/index.ts`, `packages/domain/src/audit-sample.ts`

### D-180: The sampler adds no audit action

- Date: 2026-11-15
- Decision: the sampler writes only the existing `OUTCOME_AUDIT_HELD` row through `OutcomeService.hold`. No `OUTCOME_AUDIT_SAMPLED` exists, and a test proves `GET /v1/admin/audit?action=OUTCOME_AUDIT_HELD` answers `200` with the row.
- Reason: a second row for one fact is the defect shape D-168 rejected, and the action is already in both the writer union and the reader map.
- Status: Decided
- Affects: `docs/api-contracts.md` §5.9, `services/api/test/audit-read.integration.test.ts`

### D-181: The draw is FNV-1a over the outcome id and a fixed salt

- Date: 2026-11-15
- Decision: `shouldSample` hashes `audit-sample-v1:<outcome id>` with 32-bit FNV-1a and compares the scaled value to the rate. No `node:crypto` import.
- Reason: `packages/domain` may not import a Node built-in, and the draw needs no cryptographic strength — ids are server-generated UUIDs a client cannot choose. The salt is fixed so raising the rate cannot re-roll an outcome already judged; when the rate becomes a versioned value, the salt stays.
- Status: Decided
- Affects: `packages/domain/src/audit-sample.ts`, `packages/domain/test/audit-sample.test.ts`

### D-182: The hold records a null actor as `SYSTEM`

- Date: 2026-11-15
- Decision: `HoldOutcomeInput.actorUserId` widens to `string | null`; a null actor writes `actor_role` `SYSTEM` on both the `CASE_OPENED` event and the audit row, in the shape `drizzle-reports.service.ts` already uses.
- Reason: the sampler has no account behind it. Writing a stand-in account id would attribute a system action to a person.
- Status: Decided
- Affects: `services/api/src/outcomes/outcome.service.ts`, `services/api/src/outcomes/drizzle-outcome.service.ts`

### D-183: `case_kind` keeps its three existing values and gains `audit_hold`

- Date: 2026-11-15
- Decision: the queue reports `mentor_dispute`, `conflict_of_interest`, `escalated_d7` (unchanged) and the new `audit_hold`; the filter accepts those four in any letter case and refuses anything else with `422`. The draft delta's `disputed` / `conflict_declared` names were not adopted.
- Reason: renaming two wire values would break `apps/web/lib/review-queue.ts` and its test, which the change's scope excludes, for no user-visible gain. A held case reported `escalated_d7` before this change, and that mislabel is what the new branch fixes.
- Status: Decided
- Affects: `openspec/changes/audit-sampling/specs/mentorship/platform-review/spec.md`, `packages/contracts/openapi.yaml`, `services/api/src/outcomes/drizzle-outcome.service.ts`

### D-184: "Runtime tunables" means the values that price a ledger row, and nothing else

- Date: 2026-11-15
- Decision: version payload is exactly `cooling_days`, `difficulty_weights`, `tier_multipliers`, `contribution_multipliers`, `audit_sample_rate`. `RATE_LIMITS`, cron strings, match weights, the impact reliability sample and the consent document version stay code.
- Reason: a web form that could change a rate limit or a cron expression is a denial-of-service and load-shedding surface audited instead of reviewed; `AGENTS.md` rule 13 makes throttling a code concern.
- Status: Decided
- Affects: `packages/domain/src/config-payload.ts`, `docs/architecture-decisions.md` ADR-019

### D-185: The counting job refuses to write without an active version

- Date: 2026-11-15
- Decision: `countDueOutcomes` reads the version in force once per run, stamps `config_version_id` on every row it writes, and returns `{ counted: 0, events: 0 }` when none exists.
- Reason: a delayed count is recoverable; an unattributed ledger row is not. One read per run also means a mid-batch change affects the next run only.
- Status: Decided
- Affects: `services/api/src/reputation/counting-job.ts`, `docs/data-model.md` 5.6

### D-186: The pair factor is a formula, recorded as fixed rather than carried as a value

- Date: 2026-11-15
- Decision: a version records that it fixes the `1/(1+n)` pair-factor form; the payload carries no pair-factor parameter.
- Reason: the brief counted four multipliers, but the fourth is a formula. A parameter would be an invented mechanism, which a `MATH-FLAG` forbids, and `pairFactor` already has its own property test.
- Status: Decided
- Affects: `packages/domain/src/reputation.ts` (unchanged), `docs/architecture-decisions.md` ADR-019

### D-187: Version numbers are assigned by the database

- Date: 2026-11-15
- Decision: one `INSERT ... SELECT COALESCE(MAX(version), 0) + 1` with a unique index on `version`; a lost race maps to `409 CONFIG_VERSION_CONFLICT`.
- Reason: read-then-insert races, and the unique index makes the collision visible instead of producing two rows with one number.
- Status: Decided
- Affects: `services/api/src/admin-config/drizzle-config.service.ts`, `packages/domain/src/identity.ts`

### D-188: The column is added nullable, seeded, backfilled, then made `NOT NULL` — in one migration

- Date: 2026-11-15
- Decision: `0021` creates the table, seeds version 1, adds `reputation_events.config_version_id` nullable, backfills the historical rows to version 1, and only then sets `NOT NULL` (drizzle-kit's bare `NOT NULL` add was hand-corrected).
- Reason: no window in which a null is legal, and the backfill is a true attribution because version 1 *is* the values those rows were priced by.
- Status: Decided
- Affects: `services/api/drizzle/0021_absent_morbius.sql`

### D-189: The version-1 baseline row has a null actor

- Date: 2026-11-15
- Decision: `config_versions.created_by_user_id` is nullable; the migration's seed row leaves it null, and every route-written version names its actor. The OpenAPI schema documents the null.
- Reason: no account exists at migration time, and inventing one (a synthetic system user) would be a fabricated identity in an audit surface. This is the one deviation from the design's `NOT NULL`, recorded here rather than silently.
- Status: Decided
- Affects: `services/api/src/db/schema/config.ts`, `docs/data-model.md` 5.3, `docs/api-contracts.md` 5.17

### D-190: The audit log gains `CONFIGURATION_CHANGED` in both unions

- Date: 2026-11-15
- Decision: the writer union and the reader map both gain `CONFIGURATION_CHANGED`; the version row and its audit row are written in one transaction.
- Reason: an action in the writer union only stores rows the admin filter refuses with `422`, the defect shape D-155; a reader map entry without a writer would advertise a filter that never matches.
- Status: Decided
- Affects: `services/api/src/identity/audit-log.ts`, `services/api/src/audit/audit.service.ts`

### D-191: The sampler's rate now comes from the version in force

- Date: 2026-11-15
- Decision: `sampleConfirmedOutcomes` reads `audit_sample_rate` from the active version once per run, and `auditSampleRate()` is removed; `AUDIT_SAMPLE_RATE` stays in `@connect/config` as documentation of what version 1 seeds.
- Reason: the seam existed so this change could replace the source without touching the draw logic, and a second read path through a module constant would let the two disagree.
- Status: Decided
- Affects: `services/api/src/outcomes/audit-sampler.ts`, `packages/config/src/index.ts`

### D-192: Evidence has three routes, and the third is the read that mints the link

- Date: 2026-11-16
- Decision: `POST /v1/outcomes/{id}/evidence` creates the intent, `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` carries the bytes, and `GET /v1/outcomes/{id}/evidence/{evidence_id}` returns the metadata plus a short-lived link for a clean file.
- Reason: minting a link inside `GET /v1/outcomes/{id}` would either audit every outcome read or audit none, and the admin-audit mandate needs exactly one shape where an admin's read is written and a student's is not.
- Status: Decided
- Affects: `packages/contracts/openapi.yaml`, `services/api/src/evidence/`, `docs/api-contracts.md` §5.6

### D-193: The bytes travel through the API, not through a presigned PUT

- Date: 2026-11-16
- Decision: the `complete` route accepts the file as a raw body and the API writes it with `PutObject`.
- Reason: a presigned PUT needs the object store reachable from a browser, a CORS policy on a gateway whose capabilities were unproven, and a public endpoint baked into a signature — three unverified things for at most 5 MiB. Downloads do presign, because the contract promises short-lived URLs and a download has no quarantine step left.
- Status: Decided
- Affects: `services/api/src/evidence/storage.ts`, `services/api/src/main.ts`

### D-194: A download link is signed against a browser-reachable host

- Date: 2026-11-16
- Decision: the service builds two clients from one credential set — the internal endpoint for put/get/delete and `S3_PUBLIC_ENDPOINT` (defaulting to `S3_ENDPOINT`) for signing — with a 300-second expiry. The proof against versitygw v1.10.0 passed, so the streaming fallback was not needed.
- Reason: `getSignedUrl` signs the host header, so a URL signed against `objectstore:7070` is unusable from a browser.
- Status: Decided
- Affects: `services/api/src/evidence/storage.ts`, `.env.example`, `compose.yaml`, `docs/local-setup.md`

### D-195: Quarantine is a status on one object, not a second object

- Date: 2026-11-16
- Decision: an upload lands at `outcome-evidence/{outcome_id}/{evidence_id}` with `status = QUARANTINED`; a clean scan sets `CLEAN`, a detection sets `REJECTED`, and a scanner failure leaves it quarantined. A row also records `uploaded_at`, because an intent with no bytes must never be scanned. A declared type, size or digest that disagrees with the received bytes is marked `REJECTED` by the completion route itself, before anything is stored.
- Reason: a `quarantine/` prefix plus `CopyObject` needs a store capability nobody proved and doubles the bytes written for no security gain; the status is what the read path consults. Rejecting a mismatch at completion is the same fail-closed outcome as the design's "the scan job rejects it", one step earlier, and it avoids storing bytes the server already knows are not what was declared.
- Status: Decided
- Affects: `services/api/src/db/schema/outcomes.ts`, migration `0022`, `services/api/src/evidence/drizzle-evidence.service.ts`

### D-196: The scan is an INSTREAM conversation in a worker pass, not a per-upload job

- Date: 2026-11-16
- Decision: an `evidence-scan` queue runs every two minutes and scans up to ten uploaded, quarantined, undeleted rows with clamd's `INSTREAM` protocol over `node:net` (30-second timeout). The API does not enqueue a job per upload.
- Reason: the query is the same one a retry needs, the API holds no pg-boss handle (only the worker does), and a per-upload enqueue would mean a second delivery path for retries. The cost is up to two minutes of latency before a file is readable, which the contract states. No new dependency; `node:net` is enough.
- Status: Decided
- Affects: `services/api/src/evidence/scan.ts`, `services/api/src/evidence/scan-job.ts`, `services/api/src/platform/outbox/outbox-worker.ts`

### D-197: One new audit action, in both unions

- Date: 2026-11-16
- Decision: `EVIDENCE_VIEWED` joins the writer union and the reader map, and is written in the same request that mints an admin's link, before the URL is produced. No `EVIDENCE_UPLOADED` and no `EVIDENCE_SCAN_FAILED` action is added; the row's `status`, `scanned_at` and `scan_detail` record the scan.
- Reason: one fact must not produce two audit rows (D-168), and §12 documents no upload event.
- Status: Decided
- Affects: `services/api/src/identity/audit-log.ts`, `services/api/src/audit/audit.service.ts`

### D-198: The "or a link" half of FR-OUT-02 is not built

- Date: 2026-11-16
- Decision: only a file is evidence. A link is recorded as DEBT-65 with the decisions it needs.
- Reason: a link is an untrusted URL that is displayed and clicked, and it needs a host allowlist, `rel`/`target` handling and a disclosure that it opens outside connect — the same treatment `mentorship_sessions.meeting_url` got. Inventing that policy inside an upload change would be a second feature.
- Status: Decided
- Affects: `docs/api-contracts.md` §5.6, `docs/known-debt.md` (DEBT-65)

### D-199: Missing storage configuration fails the route, never the boot

- Date: 2026-11-16
- Decision: when `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` or `S3_ENDPOINT` is absent, `createEvidenceStorage` returns no storage and the three routes answer `503 EVIDENCE_UNAVAILABLE`; the worker logs and skips. There is no `configured()` method on the client: the factory's `null` is the signal.
- Reason: failing the API's boot would take auth, requests and outcomes down with an optional feature. The factory returning nothing is one branch instead of two ways to ask the same question.
- Status: Decided
- Affects: `services/api/src/evidence/storage.ts`, `services/api/src/evidence/drizzle-evidence.service.ts`

### D-200: The body allowlist learns to skip a Buffer

- Date: 2026-11-16
- Decision: `BodyAllowlistInterceptor` returns early when the body is a `Buffer`; the route's allowlist entry is empty.
- Reason: a Buffer is `typeof "object"`, so its byte indices would be refused as `unknown property: 0`. An early return is one line; a route list inside a security control would be a second registry to drift.
- Status: Decided
- Affects: `services/api/src/http/body-allowlist.interceptor.ts`, `packages/contracts/src/body-keys.ts`

### D-201: The 5 MiB exception is scoped by content type, and the JSON cap stays 100 KiB

- Date: 2026-11-16
- Decision: `main.ts` registers a raw parser for `application/pdf`, `image/png` and `image/jpeg` at `EVIDENCE_MAX_BYTES` (5 MiB) before the JSON parser, which keeps `API_MAX_BODY_BYTES` (100 KiB). A test proves a 200 KiB JSON body is still refused with `413`.
- Reason: `body-parser` selects by content type, so the exception cannot widen the cap any route's JSON body sees; `DEBT-01` anticipated exactly this exception.
- Status: Decided
- Affects: `services/api/src/main.ts`, `services/api/src/http/request-body.ts`, `docs/api-contracts.md` §5.6

### D-202: FR-OUT-07 is built work, and D-156 no longer covers it

- Date: 2026-11-16
- Decision: `FR-OUT-07` stays `DONE`, now on the strength of code: a clean scan writes `evidence_tier = 1`. D-156's amendment of that row is superseded; its amendment of `FR-ADM-06` stands. Register 57.5 / 64 (89.8%) unchanged, code-only 55.5 / 64 (86.7%).
- Reason: the row's own text is satisfied at Tier 1 for file evidence, and Tier 2 is `FR-OUT-08`'s row (a Could), so counting OUT-07 as built is honest rather than inflated. The register total does not move because `FR-OUT-02` is a Should row.
- Status: Decided
- Affects: `docs/functional-requirements.md` (FR-OUT-02, FR-OUT-07, §2.16), `docs/milestones-and-phases.md`

### D-203: Two implementation choices that differ from the change's task list

- Date: 2026-11-16
- Decision: an upload is accepted whatever the outcome's state (no state gate), and the two test-facing seams are the evidence service's injected storage and the scan function's injected socket. The test stack (`services/api/test/support/api-stack.ts`) mirrors `main.ts`'s raw parser, and `packages/contracts/test/openapi.test.ts` now reads the evidence controller's decorators and tolerates a non-JSON request body.
- Reason: the spec fixes no state gate for attaching evidence, so adding one would invent a rule; the seams are how the repo avoids a mocking library, and a test stack that does not mirror production wiring would have hidden the body-parser bug the change exists to handle.
- Status: Decided
- Affects: `services/api/test/support/api-stack.ts`, `packages/contracts/test/openapi.test.ts`

### D-204: The retention clock starts at the terminal instant, not at the upload

- Date: 2026-11-16
- Decision: an evidence file is due for deletion `EVIDENCE_RETENTION_DAYS` (90) after `counted_at` for a `COUNTED` outcome, or after `rejected_at` for a `REJECTED` one. The predicate is a pure `evidenceRetentionDue` in `@connect/domain`, inclusive at the boundary, and a terminal row with no instant is never due.
- Reason: measuring from the upload would delete a document while its outcome is still in review — the one outcome that must keep its evidence — and a pure function is testable without a database.
- Status: Decided
- Affects: `packages/domain/src/evidence-retention.ts`, `packages/config/src/index.ts`, `services/api/src/evidence/retention.ts`

### D-205: A reversed or withdrawn outcome keeps its file

- Date: 2026-11-16
- Decision: only `COUNTED` and `REJECTED` start the retention clock. `REVERSED` and `WITHDRAWN` outcomes keep their evidence indefinitely, and DEBT-66 records that policy gap rather than hiding it.
- Reason: a clawback or a dispute is exactly when the material matters, and a withdrawal is the student's own retraction whose file is the only proof the report was made. Treating either as terminal for retention is a policy decision, not an implementation detail, so it is named for the owner.
- Status: Decided
- Affects: `packages/domain/src/evidence-retention.ts`, `docs/known-debt.md` (DEBT-66)

### D-206: The scan status does not gate deletion

- Date: 2026-11-16
- Decision: an evidence row marked `REJECTED` by the scanner (a detection) is deleted on the same clock as a clean one.
- Reason: keeping known malware for 90 days "for analysis" is a retention policy nobody asked for, there is no analysis path in the product, and it is a liability. The row keeps the signature in `scan_detail`, so the fact survives the bytes.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`

### D-207: The object goes first, the row second, and the audit row in the row's transaction

- Date: 2026-11-16
- Decision: per file, `storage.delete(key)` runs first; on success one transaction sets `deleted_at` under an `IS NULL` predicate and appends one `EVIDENCE_RETENTION_DELETED` row with `actorRole: SYSTEM` and `requestId: system:evidence-retention`. A delete failure is counted, logged, and leaves the row eligible for the next run.
- Reason: marking first and deleting second leaves a row claiming a deletion that may not have happened, and an audit log that lies is worse than a job that lags.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`, `services/api/src/identity/audit-log.ts`, `services/api/src/audit/audit.service.ts`

### D-208: Dry run is the shipped default, and only the exact string `false` turns it off

- Date: 2026-11-16
- Decision: `retentionDryRun()` returns `true` unless `EVIDENCE_RETENTION_DRY_RUN` is exactly `false`. Unset, empty, `FALSE`, `False`, `0`, `no` and any other value keep the job dry. The sweep takes `dryRun` as a parameter so the real path is fully tested while the shipped default deletes nothing.
- Reason: the mirror of `WEB_CSP_MODE` (D-170) — there one exact value disables a protection, here one exact value enables a deletion, so a typo must never destroy a document. The parameter is what makes "tested but off" honest.
- Status: Decided
- Affects: `services/api/src/evidence/retention-job.ts`, `.env.example`, `docs/local-setup.md`

### D-209: The dry-run report is a returned count and one log line

- Date: 2026-11-16
- Decision: `sweepExpiredEvidence` returns `{ examined, eligible, deleted, failed, dryRun }` and the worker logs it as one JSON line per run. No table, no route, no page.
- Reason: an `evidence_retention_runs` table would be a second source of truth for a fact the audit rows carry once a real run happens, and the operator needs one number to read, not a schema.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`, `services/api/src/platform/outbox/outbox-worker.ts`

### D-210: Hourly, one hundred files, oldest first

- Date: 2026-11-16
- Decision: `0 * * * *`, batch 100, ordered by `coalesce(counted_at, rejected_at)` ascending.
- Reason: the oldest file goes first so a backlog drains predictably, and a batch that fails part-way needs no whole-run retry: each file is independent and the next run re-examines whatever still has `deleted_at` null.
- Status: Decided
- Affects: `services/api/src/evidence/retention-job.ts`, `services/api/src/evidence/retention.ts`

### D-211: The institution aggregate ships counts, never rates

- Date: 2026-11-20
- Decision: `GET /v1/institution/aggregates` returns whole-number counts only. Acceptance and timeliness ship as integer pairs (`requests_accepted` with `requests_decided`, `requests_decided_in_time` with `requests_late_or_expired`); no percentage, share, score or ranking is computed or sent.
- Reason: the shape `D-114` to `D-116` removed from the reputation read, for the same two reasons — a rounded percentage is a lie at pilot volumes, and a share of one in four is a count of one, so it cannot be suppressed correctly.
- Status: Decided
- Affects: `services/api/src/institutions/institution-dashboard.service.ts`, `packages/contracts/openapi.yaml`, `docs/api-contracts.md` §5.7

### D-212: `institution_id` is required, and both misses are one `404`

- Date: 2026-11-20
- Decision: the read takes a required `institution_id` (a uuid, `422` otherwise), and an id that names nothing and an id the caller does not administer answer the same `404 INSTITUTION_NOT_FOUND` body. The scope is `requireScopedInstitution`, which wraps `requireInstitutionAdmin` and returns the scoped id.
- Reason: deriving the institution from the caller's single assignment would publish a wrong answer the day an admin holds two, and a different answer for the two misses would turn the parameter into an existence oracle. A platform admin holds no institution scope, so a platform admin is `403 ROLE_REQUIRED` here.
- Status: Decided
- Affects: `services/api/src/authorization/authorize.ts`, `services/api/src/institutions/institution-dashboard.controller.ts`, `packages/domain/src/identity.ts`, `docs/auth-and-access-control.md`

### D-213: A count below the floor is omitted and named; the floor lives in config

- Date: 2026-11-20
- Decision: a metric below `INSTITUTION_COHORT_FLOOR = 5` is absent from the payload and named in a `suppressed` array; a by-field row below the floor is omitted entirely and no field id is named. The rule is the pure `withholdBelowFloor` / `withheldMetrics` in `@connect/domain`.
- Reason: a null renders as zero and a rounded value is a lie, and naming a field id in `suppressed` would confirm that a small slice exists. One constant and one helper keep the settled floor from being retyped per query (D-184 keeps the value in code).
- Status: Decided
- Affects: `packages/domain/src/aggregates.ts`, `packages/config/src/index.ts`, `services/api/src/institutions/institution-dashboard.service.ts`

### D-214: Keyset on name then id, default page 50, and the page is a follow-up

- Date: 2026-11-20
- Decision: `GET /v1/institutions` paginates on the `(name, id)` pair it already orders by, through an opaque base64url cursor; `limit` is 1 to 100 defaulting to 50; a malformed cursor and an out-of-range limit are `422`; `next_cursor` is null on the last page. No aggregates page ships with this change, and `/admin/institutions` does not follow the cursor yet.
- Reason: offset pagination repeats or skips a row when an institution is created mid-walk, and the pilot holds a handful of institutions, so the default page is one page. A page needs an approved visual direction this round cannot produce, so it is `DEBT-68` rather than a hidden gap.
- Status: Decided
- Affects: `packages/domain/src/cursor.ts`, `services/api/src/institutions/drizzle-institutions.service.ts`, `packages/contracts/openapi.yaml`, `docs/known-debt.md`

### D-215: The key is scoped to caller and operation

- Date: 2026-11-20
- Decision: the unique index is (`actor_user_id`, `operation`, `key`), and `operation` is a server literal chosen by the decorator (`message.create`, `outcome.report`, `request.create`).
- Reason: a global unique key would let one caller's key collide with another's and turn a client-chosen string into a cross-tenant signal.
- Status: Decided
- Affects: `services/api/src/db/schema/idempotency.ts`, `services/api/src/platform/idempotency/store.ts`

### D-216: Two retentions on one column

- Date: 2026-11-20
- Decision: `expires_at` is five minutes at insert and twenty-four hours on completion; one hourly sweep deletes every row past it.
- Reason: one 24-hour value for both states would leave a crashed request answering `409` for a day. Five minutes is longer than any handler here and short enough that a client's retry succeeds without support.
- Status: Decided
- Affects: `services/api/src/platform/idempotency/store.ts`, `services/api/src/platform/idempotency/sweep-job.ts`

### D-217: The digest is canonical JSON, not raw bytes

- Date: 2026-11-20
- Decision: the body is serialised with recursively sorted keys and hashed with `node:crypto` `createHash("sha256")`.
- Reason: hashing `rawBody` needs a `verify` hook on the JSON parser every route shares, which keeps a copy of every request body in memory for a check three routes need.
- Status: Decided
- Affects: `packages/domain/src/idempotency.ts`, `services/api/src/platform/idempotency/interceptor.ts`

### D-218: Status is text with a check, not a pg enum

- Date: 2026-11-20
- Decision: `idempotency_keys.status` is `text` with `check (status in ('IN_PROGRESS','COMPLETED'))`.
- Reason: `docs/data-model.md` §4.1 enumerates the enums the product speaks; this one is plumbing that never reaches a payload, and adding it there would be a contract change for nothing.
- Status: Decided
- Affects: `services/api/src/db/schema/idempotency.ts`, `docs/data-model.md`

### D-219: An interceptor, applied by decorator on three routes

- Date: 2026-11-20
- Decision: `@Idempotent(operation)` applies one interceptor to exactly the three handlers; the intent row is inserted in its own autocommit statement before the handler runs.
- Reason: the interceptor must see the response body, which a guard cannot, and the decorator keeps the set visible in the controller. An intent row that rolled back with a failed write would let a retry re-execute a write that may already have committed.
- Status: Decided
- Affects: `services/api/src/platform/idempotency/interceptor.ts`, `services/api/src/platform/idempotency/idempotent.decorator.ts`, the three controllers

### D-220: A replay writes no audit row

- Date: 2026-11-20
- Decision: no `IDEMPOTENCY_REPLAYED` audit action exists. The first call writes its own row inside its transaction; a replay appends nothing.
- Reason: an audit row per replay would put a client's retry in an append-only compliance log and grow it without a fact behind each row.
- Status: Decided
- Affects: `services/api/src/platform/idempotency/interceptor.ts`, `services/api/src/identity/audit-log.ts` (unchanged)

### D-221: The honeypot is a documented body key

- Date: 2026-11-20
- Decision: `contact_website` is declared in the OpenAPI register schema and in `ROUTE_BODY_KEYS`, ignored by the identity service, and refused when non-empty by the BFF and by `AuthController`.
- Reason: an undeclared key is refused by the body allowlist with the key named, which teaches a bot exactly which field to leave empty.
- Status: Decided
- Affects: `packages/contracts/openapi.yaml`, `packages/contracts/src/body-keys.ts`, `services/api/src/identity/auth.controller.ts`, `apps/web/app/api/auth/register/route.ts`

### D-222: The intent marker is an unsigned httpOnly cookie

- Date: 2026-11-20
- Decision: `connect_signup_intent` holds the server's ISO instant, is `httpOnly`, `SameSite=Lax`, `Path=/`, one hour, and is minted by `GET /api/auth/register-intent` when the sign-up page mounts.
- Reason: the cookie is httpOnly and same-site, and the threat priced is the cost of loading the form at all, not forgery by a browser that already runs the app's own JavaScript. An HMAC would buy nothing against that threat.
- Status: Decided
- Affects: `apps/web/lib/sign-up-intent.ts`, `apps/web/app/api/auth/register-intent/route.ts`

### D-223: Two seconds and one hour, in config

- Date: 2026-11-20
- Decision: `SIGNUP_MIN_SUBMIT_SECONDS = 2` and `SIGNUP_INTENT_MAX_AGE_SECONDS = 3600` in `@connect/config`; the two-second floor is inclusive.
- Reason: two seconds is longer than any paste-and-submit gesture and far shorter than a person reading a form; one hour covers a slow fill and refuses a marker scraped yesterday. A per-deploy random window would make a refusal unreproducible in support.
- Status: Decided
- Affects: `packages/config/src/index.ts`, `apps/web/lib/sign-up-intent.ts`

### D-224: One generic refusal, and the check is logged server-side

- Date: 2026-11-20
- Decision: all three checks answer `422 REGISTRATION_REFUSED` with the same status, code, title and detail, and one log line carries only `{event: "registration.refused", check}`.
- Reason: naming the check is an oracle. The sentence tells a person the one thing that works — reload and try again — and no email, address, body or user agent reaches the log (SEC-DATA-5).
- Status: Decided
- Affects: `apps/web/app/api/auth/register/route.ts`, `apps/web/lib/strings.ts`, `services/api/src/identity/auth.controller.ts`

### D-230: A reversal and a withdrawal start their own retention clock

- Date: 2026-11-20
- Decision: `evidenceRetentionDue` reads the settled state's **own** instant — `counted_at`, `rejected_at`, `reversed_at`, `withdrawn_at` — and never a coalesce across states. A settled row whose own instant is null is never due.
- Reason: a single `coalesce(counted_at, rejected_at)` dated a reversal by the year-old count it clawed back, so the material the clawback was decided on could be deleted the day it was needed. A null instant is a projection bug; deleting on it would turn a bug into data loss.
- Supersedes: D-204's third clause ("`REVERSED` and `WITHDRAWN` keep their file"), which this reverses deliberately.
- Status: Decided (owner-approved reversal)
- Affects: `packages/domain/src/evidence-retention.ts`, `services/api/src/evidence/retention.ts`

### D-231: A consent withdrawal can only move the origin earlier

- Date: 2026-11-20
- Decision: the reporting student's earliest `INSTITUTION_DATA_SHARING` `WITHDRAWN` record, joined through the outcome's `student_profile_id`, becomes the origin when it precedes that state's own instant, and is ignored otherwise. The mentor's consent is never consulted.
- Reason: the promise is "sooner if you withdraw"; a later withdrawal must not extend a file's life, and the mentor's record describes a different person.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`

### D-232: The sweep re-checks every condition under the row lock

- Date: 2026-11-20
- Decision: the candidate selection is an optimisation only; each row is re-read inside its transaction and the whole predicate — status, own instant, consent instant, `deleted_at`, `uploaded_at` — is re-evaluated there before any delete.
- Reason: a status can move between the selection and the delete, and the transaction is where the decision has to be true. One clock decides both the selection and the re-read — the database's `now()`, unless a caller pins one — because app/DB skew of a few milliseconds turned an exactly-90-day-old row into a survivor on CI (fixed 2026-11-20, `fix/evidence-retention-clock`). The `deleted_at` written is the same instant the decision used.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`

### D-233: The dry run keeps covering the extended set

- Date: 2026-11-20
- Decision: `EVIDENCE_RETENTION_DRY_RUN` still defaults to true and the dry run reports `examined`, `eligible`, `deleted: 0` and `failed` for the extended set, including the reversal and withdrawal cases.
- Reason: the owner flips the variable after reading one honest report; a dry run that only counted the old two states would under-report the first live sweep.
- Status: Decided
- Affects: `services/api/src/evidence/retention.ts`, `docs/data-privacy-and-retention.md`

### D-225: The runbook lives at `docs/runbook.md` and is linked from two places

- Date: 2026-11-20
- Decision: `docs/runbook.md` carries the operator procedures; `README.md`'s status line and `docs/local-setup.md` link it. `production-requirements.md` §12.1 keeps the requirement and points at it.
- Reason: §12.1 is a requirements document; mixing "what launch requires" with "how to do it" makes both harder to read. The file sits beside `local-setup.md`, where an operator looks first.
- Status: Decided
- Affects: `docs/runbook.md`, `README.md`, `docs/local-setup.md`, `docs/production-requirements.md`

### D-226: The first `PLATFORM_ADMIN` is an INSERT, a verify SELECT and a written note

- Date: 2026-11-20
- Decision: the sanctioned statement already in `local-setup.md`, one `SELECT` that proves the user and the `role_assignments` row, MFA enrolment at `/account/security`, then one row in the runbook's bootstrap record table. `AGENTS.md` rule 12 is unchanged: no CLI script, no route.
- Reason: the rule's real gap was the missing note, not the missing typing. A hand-run `INSERT` writes no `audit_logs` row, so the record table is the compensation (`DEBT-46`).
- Status: Decided
- Affects: `docs/runbook.md` §6

### D-227: The restore record is a hand-filled table

- Date: 2026-11-20
- Decision: the drill is written in the runbook and its result recorded in a table (date, environment, duration, result, operator). No scripted drill.
- Reason: the provider is undecided; a script for an unknown target is untested code, and the launch criterion is a *performed* restore with a record.
- Status: Decided
- Affects: `docs/runbook.md` §7, `docs/production-requirements.md` §13.2

### D-228: A closed debt row's problem text is struck, not deleted

- Date: 2026-11-20
- Decision: every row whose `Status` cell says `Closed` and whose Debt cell is unstruck gets `~~...~~` around the Debt cell only; `Impact`, `Owner / target` and `Status` are untouched. Twenty rows were struck, including the five closed by round five.
- Reason: the file's own convention (`DEBT-19`, `DEBT-25`, `DEBT-56`); deleting the text would lose the record of what was owed.
- Status: Decided
- Affects: `docs/known-debt.md`

### D-229: Two Must rows reach `DONE` by amendment, and the counts say so

- Date: 2026-11-20
- Decision: `FR-INST-01` becomes `DONE` because its own Then clause is met and the extra scope (editing, status transitions, domain verification) appears in neither its acceptance nor `openspec/specs/institutions/onboarding`; `FR-ADM-03` loses the anomaly clause from its requirement text, which stays owed as `DEBT-62`, and becomes `DONE`. Both rows say "amended, not newly built". The register reads 59.5 / 64 = 93.0%; the code-only basis scores the three amendment-only rows (`FR-ADM-05`, `FR-ADM-06`, `FR-INST-01`) at 0.0 and `FR-ADM-03` at 0.5, giving 56.0 / 64 = 87.5%.
- Reason: a register that scores a row against scope nobody required is wrong in both directions — it understates what is built and hides that no code is owed. Labelling the amendment is what keeps the number honest.
- Status: Decided (owner-approved)
- Affects: `docs/functional-requirements.md` (`FR-INST-01`, `FR-ADM-03`, §2.16)

### D-234: `next` moves to the newest patched 16.x and the security check is never silenced

- Date: 2026-11-21
- Decision: `apps/web/package.json` pins `next` at `16.4.6` (from `16.4.3`) and `pnpm-lock.yaml` is regenerated with `pnpm install`; no ignore flag, environment variable or forked build script is added, and no other runtime dependency moves. Acceptance is four gates plus two consecutive `CI=true pnpm build` runs on a removed `apps/web/.next`.
- Reason: `CI=true pnpm build` exited 1 on a cold tree with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability` and exited 0 on the retry, so a documented gate was red and a retry habit hid it; seven of the nine moderates were on `next`, patched at 16.4.5. Staying inside `16.x` keeps the diff to one variable and one lockfile.
- Alternatives rejected: `next upgrade --agent=security`, which produces an unreviewed diff; documenting the retry, which leaves the gate red.
- Status: Decided (owner-approved as the audit's B1 recommendation)
- Affects: `apps/web/package.json`, `pnpm-lock.yaml`, `docs/known-debt.md` (`DEBT-71`, `DEBT-72`), `README.md`, `docs/milestones-and-phases.md`

### D-235: The two dev-only advisories stay until their parents' majors move

- Date: 2026-11-21
- Decision: `esbuild@0.18.20` (through the deprecated `@esbuild-kit/core-utils@3.3.2` that `drizzle-kit@0.31.11` loads) and `minimatch@10.2.6` (through `eslint@10.13.0`'s `^10.2.5`) are not bumped: the patched majors (0.25.0 and 11.0.1) fall outside both parents' ranges. `DEBT-71` closes and `DEBT-72` opens naming each parent, the advisory and the trigger.
- Reason: neither is reachable at runtime - one is a migration tool's dev server, the other a glob in the linter - and a `drizzle-kit` or ESLint major is a migration with its own risk that this change is not sized for.
- What would change this decision: a reachable HIGH or CRITICAL advisory on either, or a `trivy` image failure caused by one.
- Status: Decided (owner-approved as the audit's B2 recommendation)
- Affects: `pnpm-lock.yaml`, `docs/known-debt.md`

### D-236: One full browser path, with the mentor seeded rather than typed

- Date: 2026-11-21
- Decision: one spec walks sign-up, verification, profile and field, request, accept, message, outcome, confirm and the counted impact read. The mentor is the demo seed's `ayesha.rahman@example.edu.bd`; the student is created through `/sign-up`. The suite runs against its own `connect_e2e_test` database, which it drops, migrates and seeds, and it refuses any database whose name does not end in `_test`.
- Reason: the gate asks for one end-to-end test and the failures this product actually has are seam failures (a page that renders nothing, a BFF route missing from an allow-list, a key the API ignores). A path that stopped before the mentor's confirmation would miss the invariant the product exists for.
- Alternatives rejected: two shorter specs (auth, then outcome); driving every actor through the UI.
- Status: Decided (owner-approved as the audit's E1 recommendation)
- Affects: `e2e/`, `docs/local-setup.md`, `docs/milestones-and-phases.md` §5.5

### D-237: Its own CI job, not a step in `checks`

- Date: 2026-11-21
- Decision: a fourth job `e2e` with its own Postgres service, a Mailpit service container, `playwright install --with-deps chromium`, and `retries: 1` in CI only. `checks` keeps its five steps.
- Reason: a browser flake must not mask a unit-test regression, and the logs should say which failed. The existing job is already the longest signal in the repository.
- What would change this decision: Actions minutes becoming a real constraint, in which case the job moves to a nightly schedule plus a pre-merge label.
- Status: Decided (owner-approved as the audit's E2 recommendation)
- Affects: `.github/workflows/ci.yml`, `docs/local-setup.md`

### D-238: The verification link is read from Mailpit's HTTP API

- Date: 2026-11-21
- Decision: the suite polls `GET /api/v1/messages?limit=100` for the newest message to the student's address, reads its body from `GET /api/v1/message/{id}` and follows the link it finds. No test-only bypass, no fixed token, no environment switch in the API.
- Reason: verification is part of the path the gate names and any bypass would be a production seam that exists for tests. The shape was confirmed against the pinned container (`axllent/mailpit:v1.32.0`) before the helper was written: the list carries `ID` and `To[].Address`, the detail carries `Text`.
- Status: Decided (owner-approved as the audit's E3 recommendation)
- Affects: `e2e/support/mailpit.ts`

### D-239: The mentor's second factor is computed with Node's `crypto`

- Date: 2026-11-21
- Decision: `e2e/support/totp.ts` computes a six-digit code with `crypto.createHmac("sha1", ...)` over the seed's exported `DEMO_TOTP_SECRET`, checked against the RFC 6238 vectors in `e2e/test/totp.test.ts`. No authenticator library is added. The helper mirrors the library exactly: better-auth passes the decrypted secret to `createOTP(secret)`, which uses the string's UTF-8 bytes as the key and only decodes a `base32:` prefix, so no base32 decoding happens.
- Reason: the demo mentor's factor is enforced (its row is marked two-factor enabled), so sign-in cannot avoid the challenge; twenty lines of standard arithmetic beat a dependency.
- What would change this decision: the challenge flow using a code other than a six-digit TOTP.
- Status: Decided (a proposal-time decision, beyond the audit's list)
- Affects: `e2e/support/totp.ts`, `e2e/test/totp.test.ts`

### D-240: A gate box is ticked only with a citation in the same row

- Date: 2026-11-21
- Decision: in `docs/production-requirements.md`, `docs/milestones-and-phases.md` and any other gate checklist, a box becomes `[x]` only when the same row names the file and the test or command that proves it. A box whose evidence does not exist stays `[ ]` with a one-line `unmet: <gap>` naming the change that owns it where one exists.
- Reason: the files were wrong in both directions - 39 unticked boxes for controls that are built and tested, and a sentence pointing at a change archived two weeks earlier. A citation makes the next drift visible in the diff instead of in an audit.
- Alternatives rejected: ticking everything that looks built, which is how the file got here; deleting the checklists, which loses the gate document the pilot decision reads.
- Status: Decided (owner-approved as the audit's DT1 recommendation)
- Affects: `docs/production-requirements.md` sections 4, 7, 8, 9, 10 and 13; `docs/milestones-and-phases.md` section 5.5; `docs/assumptions-and-open-questions.md` Q5

### D-241: `DEBT-11` and `DEBT-14` are retargeted, and the admin session timeouts get their own row

- Date: 2026-11-21
- Decision: `DEBT-11` (SMTP failover and the identity library's inline mail) is retargeted at `first-deployment-restore-drill-and-observability`. `DEBT-14` keeps its profile-visibility clause and target; its admin idle and absolute timeout clause moves to a new `DEBT-74`, targeted at a named `admin-session-timeouts` change, because a security control on the most privileged role must not stay buried in a narrowed row whose target has closed.
- Reason: `docs/known-debt.md` section 3 requires one owner and one target per row, and both rows named Sprint 7, which finished without either item; a row whose target no longer exists is invisible to planning.
- What would change this decision: the owner deciding the timeouts are out of the pilot's scope, in which case `DEBT-74` is marked `Deferred (owner decision)` rather than deleted.
- Status: Decided (owner-approved as the audit's DT2 recommendation)
- Affects: `docs/known-debt.md`, `docs/auth-and-access-control.md`

### D-242: One plain `globals.css` with tokens, no styling dependency

- Date: 2026-11-21
- Decision: a single `apps/web/app/globals.css` imported by `app/layout.tsx`, holding `:root` custom properties and styles for the plain elements, plus a handful of semantic classes where a piece of markup needs a name. No Tailwind, no CSS modules per page, no CSS-in-JS, no webfont.
- Reason: the repository carries no styling dependency and its rules forbid adding one outside an approved change; a token file plus element styles is the smallest complete answer, needs no build configuration, and keeps one idiom. The CSP already allows a same-origin stylesheet with no nonce.
- Alternatives rejected: Tailwind (a dependency, a config surface, a content-scanning step); CSS modules per page (23 files to keep in sync, no shared tokens).
- Status: Decided (owner-approved as the audit's V1 recommendation)
- Affects: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `README.md` section 7.5

### D-243: Calm institutional direction, with the four stakeholder colours as role accents only

- Date: 2026-11-21
- Decision: one surface, one ink, one accent for the primary action, and the four stakeholder colours used only as badge accents, never as a page or panel background. Type is a system stack on a four-step scale; spacing is a 4 px grid. Every colour pair was measured before the pages were styled (ink 18.1:1, muted ink 7.81:1, the interactive border 3.32:1, white on the accent 5.0:1, each state pair above 4.5:1).
- Reason: the product is bought on the strength of evidence, so the register should read as documentation rather than as a landing page; the stakeholder colours already exist in the project's vocabulary, so role accents cost nothing and give each role a marker.
- Alternatives rejected: neutral product-SaaS (indistinguishable); plain utility in the gov.uk register (accessible, uninviting to a 20-year-old student).
- Status: Decided (owner-approved as the audit's V2 recommendation)
- Affects: `apps/web/app/globals.css`, `e2e/visual-contract.spec.ts`, `README.md` section 7.5

### D-246: The marker moves on open, once per load and once per focus window

- Date: 2026-11-21
- Decision: `/mentorship/{id}` posts `POST /v1/mentorships/{id}/read` when the thread loads and again only after a 30-second focus window (`shouldMarkRead` in `apps/web/lib/read-state.ts`). A read of the thread never moves the marker by itself, scrolling never marks anything read, and a failed write keeps the thread and shows the catalog error line.
- Reason: the marker is the server's record of what a person has seen; a scroll heuristic or a silent page-level write marks messages read that nobody read, and a re-render would double-post.
- Status: Decided (owner-approved as the audit's R1 recommendation)
- Affects: `apps/web/app/mentorship/[id]/page.tsx`, `apps/web/lib/read-state.ts`, `apps/web/app/api/mentorships/[[...path]]/route.ts`

### D-247: The count appears on the list and in the thread, nowhere else

- Date: 2026-11-21
- Decision: `/requests` shows a badge for a non-zero `unread_count` (one read for the whole page from `GET /api/mentorships`) and the thread draws a "new messages" divider where the previous marker fell. No navigation badge, no poller, no read receipts.
- Reason: those are the two surfaces that already read mentorships; a global badge needs a fetch on every page and a shared store, and a receipt is a new privacy surface the requirement does not ask for.
- What would change this decision: a pilot user missing replies because they only open the app at the directory.
- Status: Decided (owner-approved as the audit's R2 recommendation)
- Affects: `apps/web/app/requests/page.tsx`, `apps/web/lib/read-state.ts`, `apps/web/lib/strings.ts`
### D-244: Serious and critical axe violations fail the run; moderate and minor are recorded

- Date: 2026-11-21
- Decision: `@axe-core/playwright` 4.14.0 runs on every surface the app serves with axe's default rule set; a `serious` or `critical` violation fails the run and names the surface, the rule and the element, while `moderate` and `minor` are printed and recorded but do not fail it.
- Reason: those two severities map to a barrier a person cannot work around (no accessible name, an unlabelled control, a colour-only signal); a gate that fails on all four would be red for reasons no pilot user feels, and the first response to such a gate is to disable it.
- What would change this decision: the pilot reporting a real barrier from a moderate rule, in which case that rule is promoted to the gate individually.
- Status: Decided (owner-approved as the audit's A1 recommendation)
- Affects: `e2e/accessibility.spec.ts`, `e2e/support/axe.ts`, the `e2e` CI job
### D-245: The manual pass is a dated record, and it is what makes a DONE claim legitimate

- Date: 2026-11-21
- Decision: one file, `docs/audit/<date>-accessibility-pass.md`, naming the surfaces, the browser, every finding and its fix or tracking row, and the automated run that covers the same surfaces. `FR-UX-04` becomes `DONE` only when that file exists and its AA findings are closed; the NVDA pass cannot be performed by an agent, so the row stays `PARTIAL` until the owner runs it (F3 in the record).
- Reason: the row has been `PARTIAL` for a month because "we designed it accessibly" is not evidence; a dated record with a scope is what a partner asks for, the same shape `docs/runbook.md` uses for a restore drill (D-227).
- What would change this decision: a third-party accessibility audit before the pilot, which would become the record's source.
- Status: Decided (owner-approved as the audit's A2 recommendation)
- Affects: `docs/audit/2026-11-21-accessibility-pass.md`, `docs/functional-requirements.md`, `docs/known-debt.md`
### D-248: The breach check uses the keyless range endpoint, and only a prefix leaves

- Date: 2026-11-21
- Decision: passwords are checked against `https://api.pwnedpasswords.com/range/{first five hex characters of the SHA-1}`, with `Add-Padding: true`, a 3-second `AbortSignal.timeout`, a bounded in-process cache keyed on the prefix, and no API key. The password, the full digest, the email and any user id never leave the process.
- Reason: the range endpoint is free and keyless, which the pilot's cost envelope allows; the keyed `/breachedaccount` endpoint and commercial feeds are the paid alternative and are out of scope. SHA-1 is the provider's index only, never storage, so it must not be "upgraded" to SHA-256 (that would match nothing).
- Status: Decided (owner-approved as the audit's R3 recommendation)
- Affects: `packages/domain/src/password-breach.ts`, `services/api/src/identity/password-breach.ts`
### D-249: An unreachable provider accepts the password and logs one line

- Date: 2026-11-21
- Decision: a timeout, a non-200 answer, an unreadable body or a network error makes the check answer `unavailable`; the password is accepted and one structured line records `{ event: "password.breach_check_unavailable", reason }`. A test proves the refusal path cannot be reached without a provider answer, and the log line carries no password, digest or identifier.
- Reason: failing closed turns a provider outage into a sign-up outage for every participant; a twelve-character minimum still applies, and the event is the alert the deployment change watches. The privileged-role exception is not half-built: it is `DEBT-77`.
- Status: Decided (owner-approved as the audit's R4 recommendation)
- Affects: `services/api/src/identity/password-breach.ts`, `services/api/src/identity/better-auth-identity.service.ts`, `docs/known-debt.md`
### D-250: The host is chosen by the documented one-day test, with Render first

- Date: 2026-11-21
- Decision: no host is chosen by this change. `production-requirements.md` §5's one-day test decides, with Render as the first candidate; the ADR records it as `Proposed`. The test measures response time from a Bangladesh mobile connection, confirms PITR and bucket privacy, and records the monthly cost.
- Reason: picking a provider from documentation would be a guess, and the test is one day of work the owner can do; a script for an unknown target is untested code.
- Status: Decided (owner-approved as the audit's R5 recommendation); the provider itself remains an owner action.
### D-251: Error tracking is Sentry's free tier, inert without a DSN, with a shared scrub list

- Date: 2026-11-21
- Decision: `@sentry/node` 11.16.0 in the API and worker, `@sentry/nextjs` 11.16.0 in the web app, initialised only when `SENTRY_DSN` is set. One scrub list in `packages/domain/src/observability-scrub.ts` drops `authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-api-key`, `proxy-authorization`, the query string, and every key named password, token, secret, content, message, body, text, html, question, answer, summary or note; the user's email and IP are removed.
- Reason: the pilot needs error visibility before real users, the free tier covers that volume, and an inert default keeps local development and CI unchanged. Scrubbing is a pure function so it is tested rather than trusted.
- Status: Decided (owner-approved as the audit's R5 recommendation)
- Affects: `services/api/src/platform/observability.ts`, `apps/web/instrumentation.ts`, `packages/domain/src/observability-scrub.ts`
### D-252: The restore drill is dump-and-restore first, point-in-time second

- Date: 2026-11-21
- Decision: the first drill is `pg_dump` and `pg_restore` into a scratch database with row counts for `users`, `outcomes` and `audit_logs` and one authenticated read through the API against the restored data. A point-in-time variant is a second row, added once PITR is confirmed on the chosen plan.
- Reason: the dump-and-restore drill proves the backup is readable and the application works against it; PITR proves the window. Both are needed, in that order, and the first is possible on any provider.
- Status: Decided (owner-approved as the audit's R5 recommendation)
- Affects: `docs/runbook.md` §7, `infra/deploy/deploy.sh`
