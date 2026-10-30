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
- Decision: `data-model.md` section 4.1 is the single canonical enum source. DB values `UPPER_SNAKE`, API values `lower_snake`. Outcome has 7 states; request has `WITHDRAWN` and `EXPIRED` (no `CANCELLED`); account status and mentor onboarding status are split from operating status; consent has 8 purposes.
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
