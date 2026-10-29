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
| 0 | Setup | `docker compose up` starts Postgres, object store, mail catcher, scanner, API, worker, web; CI is green; OpenSpec is initialized; outbox, pg-boss, and the email adapter run end to end on a test event |
| 1 | Identity and profiles | Email/password sign-up, verification, forgot-password, 18+ gate; student and mentor profiles; a user-created field; institutions and domains seeded; consent records written |
| 2 | Access and discovery | Google sign-in; MFA enrollment; session list and revoke; Level 1 affiliation by institutional email; mentor activation; suggested mentors with reasons |
| 3 | Requests | Structured request, accept/decline/withdraw, capacity lock, 48h expiry, 24h reminder email, idempotent retries |
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

## 5. First 10 OpenSpec change proposals (in order)

1. `bootstrap-monorepo-and-docker` — repository, CI, Docker Compose, base Next.js and NestJS apps, health endpoints.
2. `identity-better-auth` — `IdentityService`, Google and email/password, verification, forgot-password, sessions, MFA.
3. `age-gate-and-account-status` — 18+ check without storing date of birth, `account_status`, audit entry.
4. `profiles-and-dynamic-fields` — student/mentor profiles, `fields` with normalized slug, primary field, availability.
5. `affiliation-and-mentor-onboarding` — Level 1 registration, admin attestation, onboarding vs operating status.
6. `matching-and-discovery` — pure match function, weights from config, suggestions with reasons, suggestion log.
7. `requests-and-capacity` — create/accept/decline/withdraw, capacity lock, 48h expiry and 24h reminder, notifications.
8. `mentorship-thread-and-sessions` — mentorship on acceptance, agreement, thread, meeting link, held confirmations.
9. `outcomes-and-verification` — outcome state machine, append-only events, evidence upload and scan, withdraw, conflict declaration.
10. `reputation-and-platform-review` — counted outcomes, pair factor, snapshots, review queue with written reason, clawback, audit log.

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
