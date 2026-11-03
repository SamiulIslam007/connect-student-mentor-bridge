---
title: MVP Build Plan
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
---

# MVP Build Plan

> **Purpose.** The single plan the builder and the coding agents follow from Sprint 0 to Gate 1.
> It does not restate the requirements; it says what is in the MVP, in what order, and what "done" means.
> Requirements: `functional-requirements.md`. Gates: `milestones-and-phases.md`. Decisions: `decision-log.md`.

## 1. MVP scope

**Goal:** a working pilot build for one partner, ready in about 2 months at about 3 days per week.

### 1.1 Must (Gate 1 cannot pass without these)

| Area | Requirements |
|---|---|
| Identity | FR-AUTH-01 to 07; Google + email/password; email verification; forgot-password; 18+ gate; MFA for privileged roles |
| Profiles | FR-PROF-01 to 05; dynamic fields; availability; capacity cap; access mode; mentor activation gate |
| Affiliation | FR-VER-01, 02, 04, 05; Level 1 for mentors and students |
| Discovery | FR-DISC-01 to 03, 06 |
| Requests | FR-REQ-01, 02, 03 (accept/decline), 05, 06, 07, 08; 48h expiry, 24h reminder |
| Mentorship | FR-THR-01 to 03 |
| Outcomes | FR-OUT-01, 03 to 07, 09; state machine; conflict declaration; evidence tier |
| Reputation | FR-REP-01 to 05, 07 |
| Admin and trust | FR-ADM-01, 03 to 07 |
| Privacy and audit | FR-CONS-01, 02; FR-PRIV-01; FR-PRIV-02 (intake and ledger-safe pseudonymization); FR-AUD-01 |
| Notifications | FR-NOT-01 |
| Experience | FR-UX-01, 02, 04, 05 |

### 1.2 Should (Phase 1 if it fits; otherwise Phase 1b)

FR-DISC-04, 05; FR-MEN-01, 02; FR-SES-01, 02; FR-OUT-11 (withdraw); FR-REQ-04 (redirect approval); FR-INST-01, 02 (basic), 03; FR-NOT-02 to 04; FR-AUD-02; FR-OUT-02 (evidence upload); FR-PRIV-03 (retention sweeper); FR-UX-03, 06; institution funnel detail (FR-INST-02); field merge tool (FR-ADM-08); ops dashboard (FR-ADM-09).

### 1.3 Later (explicitly out)

Payments and paid office hours; Flutter/native; Zoom API; Redis; WebSocket/real-time; AI features and models (FR-AI-01 to 04); phone OTP; SAML; Microsoft login; **appeals (FR-ADM-02)**.

### 1.4 Never cut

Google and password sign-in, 18+ gate, Level 1 gate, outcome state machine enforcement, append-only ledger, audit log, consent records, privacy export, object-level authorization, backup and restore test.

## 2. Eight sprints (3 working days each)

| Sprint | Theme | Demo goal |
|---|---|---|
| 0 | Setup | `docker compose up` starts Postgres, object store, mail catcher, scanner, API, worker, web; CI is green; OpenSpec is initialized; the email adapter delivers a real verification email. The outbox/pg-boss test-event demo moves to `outbox-and-job-runner` (6a, Sprint 3) |
| 1 | Identity and profiles | Email/password sign-up, verification, forgot-password, 18+ gate; student and mentor profiles; a user-created field; institutions and domains seeded; consent records written. Partials and their homes are listed in `milestones-and-phases.md` §5.2 |
| 2 | Access and discovery | `access-google-mfa-and-sessions` (4a): Google sign-in, MFA enrollment, session list/revoke, role authorization, profile visibility. `profile-availability-and-access-mode` (4b): availability windows, access mode, pause/resume. Then Level 1 affiliation by institutional email, mentor activation, and suggested mentors with reasons |
| 3 | Outbox, requests, notifications | `outbox-and-job-runner` (6a): outbox table, pg-boss, worker consumer, email through the queue with retry. Then the structured request, accept/decline/withdraw, capacity lock, 48h expiry, 24h reminder email, idempotent retries |
| 4 | Mentorship and thread | Agreement, messages, email notifications, meeting link, session held confirmations |
| 5 | Outcomes | Report, confirm, dispute, withdraw, conflict declaration, evidence upload and scan, evidence tier, day 3/5/7 reminders and escalation |
| 6 | Reputation | Counted outcomes, pair factor, snapshots, confidence tiers, clawback, counts-only view |
| 7 | Admin, privacy, hardening | Platform review with written reason, audit sampling, moderation, export download, deletion intake, audit log, accessibility, rate limits, restore drill, runbook, Terms and Privacy Notice drafts; basic institution aggregates only if time remains |

Details and the cut order: `milestones-and-phases.md` sections 5.2 and 5.3.

## 3. Definition of Ready

A work item is ready when:

1. It traces to a requirement ID in `functional-requirements.md`.
2. An OpenSpec change proposal exists and has been read.
3. The acceptance test (Given / When / Then) is written.
4. The governing document is Approved, and no Open decision blocks it.
5. It fits in one sprint of about 3 days; otherwise split it.

## 4. Definition of Done

A work item is done when:

1. The spec and tests were written before the implementation.
2. Lint, type-check, unit tests, contract tests, and build pass locally and in CI.
3. Pure domain rules have unit tests; state transitions and ledger invariants have tests.
4. The API contract (`packages/contracts/openapi.yaml`) is updated and the client regenerated.
5. It runs from `docker compose up` on a clean machine.
6. No secret, real user data, or production data is in code, logs, or fixtures.
7. The acceptance test passes.
8. Relevant docs are updated; a changed decision has a `decision-log.md` entry.
9. The diff is the smallest change that satisfies the requirement.

## 5. Ordered OpenSpec change proposals

Status values: `DONE` (archived with evidence), `IN PROGRESS` (proposed or applied, not archived), `PLANNED`, `BLOCKED`.

The original ten entries keep their numbers. Three rows were inserted without renumbering: **4a** and **4b** in Sprint 2, and **6a** in Sprint 3. Sprint 2 order is 4a → 4b → #5 → #6 (4a must land before #5 because mentor activation needs MFA; 4b must land before discovery). Sprint 3 order is 6a → #7.

| # | Change | Scope | Status |
|---|---|---|---|
| 1 | `bootstrap-monorepo-and-docker` | Repository, CI, Docker Compose, base Next.js and NestJS apps, health endpoints | `DONE` (archived 2026-10-29; the Drizzle schema/migration and the email adapter were delivered by change #2; outbox + pg-boss are owned by `outbox-and-job-runner` (6a), Sprint 3) |
| 2 | `identity-better-auth` | `IdentityService`, email/password sign-up with verification, forgot/reset password, 18+ gate, Postgres session store, consent and audit rows, institution seed. **Google sign-in, MFA, and session list/revoke move to the Sprint 2 change `access-google-mfa-and-sessions`** | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 52 tests) |
| 3 | `account-status-lifecycle` | Account-status lifecycle (`PENDING`, `ACTIVE`, suspension, deactivation) and the blocked-signup policy. The 18+ gate and `signup_blocks` ship in change 2 (D-35) | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 78 tests) |
| 4 | `profiles-and-dynamic-fields` | Student/mentor profiles, `fields` with normalized slug, primary field, `GET /v1/fields`, and the `/v1/me` profile extension. Availability and access mode move to `profile-availability-and-access-mode` | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 115 tests) |
| — | `sprint1-hardening-and-plan-closure` | Closes the independent Sprint 0/1 audit findings: app-role grants, CI database tests, audit FK `RESTRICT`, email/transport hardening, taxonomy bounds and pagination, forgot-password and under-18 UI | `IN PROGRESS` (implemented on `feat/sprint1-hardening-and-plan-closure`; review gate and archive pending) |
| 4a | `access-google-mfa-and-sessions` | Google sign-in and provider linking, MFA enrollment/verification, session list and per-session revoke, role-based authorization, profile visibility. **Sprint 2, before #5** because mentor activation needs MFA | `PLANNED` |
| 4b | `profile-availability-and-access-mode` | Availability windows, `access_mode` (Open / Application-only / Paused), pause/resume, availability validation and UI. **Sprint 2, before discovery (#6)** | `PLANNED` |
| 5 | `affiliation-and-mentor-onboarding` | Level 1 registration, admin attestation, onboarding vs operating status | `PLANNED` |
| 6 | `matching-and-discovery` | Pure match function, weights from config, suggestions with reasons, suggestion log | `PLANNED` |
| 6a | `outbox-and-job-runner` | `outbox_events`, pg-boss, the worker consumer, email through the queue with retry, and the outbox test event. **Sprint 3, before #7** | `PLANNED` |
| 7 | `requests-and-capacity` | Create/accept/decline/withdraw, capacity lock, 48h expiry and 24h reminder, notifications | `PLANNED` |
| 8 | `mentorship-thread-and-sessions` | Mentorship on acceptance, agreement, thread, meeting link, held confirmations | `PLANNED` |
| 9 | `outcomes-and-verification` | Outcome state machine, append-only events, evidence upload and scan, withdraw, conflict declaration | `PLANNED` |
| 10 | `reputation-and-platform-review` | Counted outcomes, pair factor, snapshots, review queue with written reason, clawback, audit log | `PLANNED` |

After these: privacy export and deletion, institution aggregates with suppression, accessibility and hardening.

## 6. Decisions still open, and when to decide

| Decision | When | Why it can wait |
|---|---|---|
| Hosting provider and region (Heroku, Render, or Azure) | After Gate 1, before real users | Everything is containerized; the local stack is the test environment |
| Pilot partner type (university, bootcamp, small department) | Before Gate 2 | Partner talks are running; it does not change the build |
| Institutional pricing and contract shape | After the pilot | No money moves in the pilot |
| Payments, legal entity, tax | Phase 3, before the first invoice | Payments are last |
| Counsel engagement and data residency | After the pilot, before wider onboarding | Terms and Privacy Notice are owner drafts for Gate 2 |
| Trust-and-safety reviewer | After the pilot | the owner covers reviews in the pilot |
| Kill and pivot thresholds | Before the pilot starts | Needs pilot recruitment numbers to be meaningful |

## 7. Verification each sprint

- CI: lint, type-check, unit tests, contract tests, build.
- One end-to-end happy-path test from Sprint 2 onward.
- Manual check of the sprint demo goal on a clean `docker compose up`.
- Sprint review note appended to `docs/decision-log.md` only when a decision changes.
