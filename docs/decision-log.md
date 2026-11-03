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

