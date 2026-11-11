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
| 2 | Access and discovery | `access-google-mfa-and-sessions` (4a): Google sign-in, MFA enrollment, session list/revoke. `account-access-ui`: the signed-in header, the MFA enrollment page, and the session list reachable by clicking. `roles-and-profile-visibility` (4c): role authorization and profile visibility. `profile-availability-and-access-mode` (4b): availability windows, access mode, pause/resume. Then Level 1 affiliation by institutional email, mentor activation, and suggested mentors with reasons |
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

The original ten entries keep their numbers. Rows were inserted without renumbering: **4a**, **4b**, and **4c** in Sprint 2, and **6a** in Sprint 3. Sprint 2 order is 4a → 4c → 4b → #5 → #6 (4c must land before #5 because mentor activation needs role-keyed MFA; 4b must land before discovery). Sprint 3 order is 6a → #7. Sprint 4 is #8 (mentorship, thread, sessions); Sprint 5 is #9 (outcomes).

| # | Change | Scope | Status |
|---|---|---|---|
| 1 | `bootstrap-monorepo-and-docker` | Repository, CI, Docker Compose, base Next.js and NestJS apps, health endpoints | `DONE` (archived 2026-10-29; the Drizzle schema/migration and the email adapter were delivered by change #2; outbox + pg-boss are owned by `outbox-and-job-runner` (6a), Sprint 3) |
| 2 | `identity-better-auth` | `IdentityService`, email/password sign-up with verification, forgot/reset password, 18+ gate, Postgres session store, consent and audit rows, institution seed. **Google sign-in, MFA, and session list/revoke move to the Sprint 2 change `access-google-mfa-and-sessions`** | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 52 tests) |
| 3 | `account-status-lifecycle` | Account-status lifecycle (`PENDING`, `ACTIVE`, suspension, deactivation) and the blocked-signup policy. The 18+ gate and `signup_blocks` ship in change 2 (D-35) | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 78 tests) |
| 4 | `profiles-and-dynamic-fields` | Student/mentor profiles, `fields` with normalized slug, primary field, `GET /v1/fields`, and the `/v1/me` profile extension. Availability and access mode move to `profile-availability-and-access-mode` | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 115 tests) |
| — | `sprint1-hardening-and-plan-closure` | Closes the independent Sprint 0/1 audit findings: app-role grants, CI database tests, audit FK `RESTRICT`, email/transport hardening, taxonomy bounds and pagination, forgot-password and under-18 UI | `DONE` (archived 2026-11-03; `pnpm lint`, `typecheck`, `test`, `build` green, 147 tests with 0 skipped under `CI=true`) |
| 4a | `access-google-mfa-and-sessions` | Google sign-in and provider linking, TOTP enrollment/verification with backup codes and attempt limits, session list and idempotent per-session revoke. **Sprint 2** | `DONE` (archived 2026-11-04; `pnpm lint`, `typecheck`, `test`, `build` green, 0 skipped under `CI=true`; provider success path UNVERIFIED without owner Google credentials, DEBT-15) |
| 4c | `roles-and-profile-visibility` | `role_assignments`, role guard, `requiresMfa` policy, permission-matrix test, `canViewProfile`. The admin idle/absolute session timeouts moved to Sprint 7 (D-48). **Sprint 2, before #5** because mentor activation needs role-keyed MFA | `DONE` (archived 2026-11-05; `pnpm lint`, `typecheck`, `test`, `build` green, 204 tests with 0 skipped under `CI=true`; the admin session timeouts moved to Sprint 7, D-48) |
| 4b | `profile-availability-and-access-mode` | Availability windows, `access_mode` (Open / Application-only / Paused), pause/resume, availability validation and UI. **Sprint 2, before discovery (#6)** | `DONE` (archived 2026-11-05; `pnpm lint`, `typecheck`, `test`, `build` green, 230 tests with 0 skipped under `CI=true`; `APPLICATION_ONLY` and capacity-on-resume stay with #7, DEBT-17) |
| 4d | `account-access-ui` | Signed-in header, second-factor enrollment/disable page, reachable session list, sign-out vs sign-out-everywhere, `mfa_enabled` on `GET /v1/me`. **Sprint 2, before 4c** (4c's role-keyed MFA needs an enrollment path) | `DONE` (archived 2026-11-05; `pnpm lint`, `typecheck`, `test`, `build` green, 185 tests with 0 skipped under `CI=true`) |
| 5 | `affiliation-and-mentor-onboarding` | Level 1 registration, seeded attestation, onboarding vs operating status | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, 257 tests with 0 skipped under `CI=true`; admin approve/reject deferred by D-56 as DEBT-19, agreements and orientation as DEBT-18) |
| 6 | `mentor-suggestions-and-reasons` (the suggestions half of `matching-and-discovery`) | Pure scoring rule in `@connect/domain` for three of the four documented factors, weights and the batch distance in `@connect/config`, `GET /v1/suggestions` (student-only, five mentors, 1 to 3 reasons, `limited_information`), and the "Suggested for you" section on `/mentors`. The suggestion log stays DEBT-42 | `IN PROGRESS` (applied 2026-11-11; gates green under `CI=true`; batch distance `0` per D-95 with DEBT-44 open; no migration) |
| 6a | `outbox-and-job-runner` | `outbox_events`, pg-boss, the worker consumer, email through the queue with retry, and the outbox test event. **Sprint 3, before #7** | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, 265 tests with 0 skipped under `CI=true`; identity mail stays direct, DEBT-11) |
| 7 | `requests-and-48h-flow` | Structured request, capacity lock (rolling 7-day window), accept/decline/withdraw, 48h expiry and 24h reminder, queued request emails, `/requests` and the request form | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, 300 tests with 0 skipped under `CI=true`; acceptance creates no mentorship until #8 (closed by #8, DEBT-20); draft autosave remains open) |
| 8 | `mentorship-thread-and-sessions` | Mentorship on acceptance, agreement, thread, meeting link, held confirmations | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests run under `CI=true`; DEBT-20 and DEBT-17 closed, DEBT-21 recorded; `ENDED_EARLY`, `AD_HOC`, redaction, and read state stay unexposed) |
| 9 | `outcomes-and-verification` | Outcome state machine, append-only events, withdraw, conflict declaration. Evidence upload and scan move to DEBT-22 | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests under `CI=true`; report/confirm/dispute/conflict/withdraw, the append-only event and verification ledgers, the day 3/5/7 timers, and `OUT-Q1` as code; evidence endpoints documented but unbuilt, DEBT-22; counting stays with the next change) |
| 10 | `reputation-ledger-and-counting` | Counted outcomes, pair factor, snapshots and the replay guarantee, counts-only impact reads. **Split from `reputation-and-platform-review`** (D-66) | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests under `CI=true`; the counting job, one append-only event per counted outcome, the replayable snapshot, two counts-only impact reads, and every multiplier as a `1.0` placeholder, D-67; outcomes in review have no exit until the next row, DEBT-23) |
| 10a | `mentor-directory` | Public mentor directory (`GET /v1/mentors`), the BFF route and `/mentors` page, header links, and the dev-only demo seed. No rank, no migration | `DONE` (archived 2026-11-09; `pnpm lint`, `typecheck`, `build`, `test` green under `CI=true` — domain 87, web 110, contracts 17, api 185, 0 skipped; PR #28, merge `35d2987`; live BFF/API/browser checks passed; Stitch was unavailable, page follows existing patterns) |
| 10c | `request-validation-and-rate-limits` | API-wide body allowlist (`SEC-API-1`), `@nestjs/throttler` limits, and the `429 RATE_LIMITED` shape. Per-IP only (DEBT-27); independent of 10a/10b | `DONE` (archived 2026-11-09; gates green under `CI=true` — domain 87, web 110, contracts 19, api 194, 0 skipped; PR #30, merge `d1f6d98`; DEBT-01 and DEBT-12 closed, DEBT-02 narrowed, DEBT-27 opened) |
| 10b | `platform-review-queue` | Reviewer decisions with a written reason, `REJECTED`, clawback (`REVERSAL`), and the exit from `IN_PLATFORM_REVIEW`. **Follows #10** (D-66) | `DONE` (archived 2026-11-09; gates green under `CI=true` — domain 92, web 117, contracts 19, api 197, 0 skipped; PR #32, merge `706c610`; migration `0015`; DEBT-23 closed, DEBT-28 recorded) |
| 13 | `abuse-reports-and-sanctions` | `POST /v1/reports` (four target kinds, visibility-checked), the platform-admin report queue and one-shot resolution, the first admin write (`POST /v1/admin/accounts/{id}/suspend` with a reason and an optional end date that never lifts itself), `/admin/reports`, the thread Report control, and the post-session status re-check that closes DEBT-09 | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 132, contracts 19, api 211, 0 skipped; PR #38, merge `b5fed8b`; migration `0017`; FR-ADM-04 partial, FR-ADM-05 narrowed, FR-AUTH-10 built, D-87 to D-90 recorded, DEBT-09 closed, DEBT-40 opened) |
| 12 | `privacy-export-and-erasure` | `POST /v1/privacy/export` (one JSON document, fixed allowlist, no secrets), `POST /v1/privacy/delete` (a one-transaction tombstone that keeps the ledger), the `privacy_requests` tracking table, and both `/account` controls | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 127, contracts 19, api 204, 0 skipped; PR #36, merge `310291e`; migration `0016`; FR-PRIV-01 narrowed and FR-PRIV-02 built, D-84 to D-86 recorded, DEBT-39 opened) |
| 11 | `trust-surfaces` | Published, versioned consent documents (`/terms`, `/privacy`), an API-enforced `consent_accepted` at registration, the verified-badge disclaimer on every directory card and beside the impact summary, and the debt rows for the unbuilt Musts | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 123, contracts 19, api 198, 0 skipped; PR #34, merge `8dddcbb`; no migration; FR-CONS-01 partial, FR-VER-05 built, D-82 and D-83 recorded, DEBT-29 to DEBT-38 opened, DEBT-27 re-pointed at D-79) |

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
