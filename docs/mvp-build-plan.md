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

| Area | Requirements (one row per register area, every Must id spelled out) |
|---|---|
| Authentication and access | FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-AUTH-06, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09, FR-AUTH-10 |
| Profiles and onboarding | FR-PROF-01, FR-PROF-02, FR-PROF-03, FR-PROF-04, FR-PROF-05 |
| Affiliation verification | FR-VER-01, FR-VER-02, FR-VER-04, FR-VER-05 |
| Discovery and matching | FR-DISC-01, FR-DISC-02, FR-DISC-03, FR-DISC-06 |
| Mentorship requests | FR-REQ-01, FR-REQ-02, FR-REQ-03, FR-REQ-05, FR-REQ-06, FR-REQ-07, FR-REQ-08 |
| Mentorship, threads, and sessions | FR-THR-01, FR-THR-02, FR-THR-03 |
| Outcomes and verification | FR-OUT-01, FR-OUT-03, FR-OUT-04, FR-OUT-06, FR-OUT-07, FR-OUT-09, FR-OUT-10 |
| Reputation | FR-REP-01, FR-REP-02, FR-REP-03, FR-REP-04, FR-REP-05, FR-REP-07 |
| Institutions | FR-INST-01 |
| Platform administration, trust, and safety | FR-ADM-01, FR-ADM-03, FR-ADM-04, FR-ADM-05, FR-ADM-06, FR-ADM-07 |
| Notifications | FR-NOT-01 |
| Consent, privacy, and audit | FR-CONS-01, FR-CONS-02, FR-PRIV-01, FR-PRIV-02, FR-PRIV-03, FR-AUD-01 |
| Client experience | FR-UX-01, FR-UX-02, FR-UX-04, FR-UX-05 |

This list is the register's Must set, id for id (`docs/functional-requirements.md`), and the two are checked against each other by a sorted diff rather than by reading.

### 1.2 Should (Phase 1 if it fits; otherwise Phase 1b)

FR-DISC-04, 05; FR-MEN-01, 02; FR-SES-01, 02; FR-OUT-11 (withdraw); FR-REQ-04 (redirect approval); FR-INST-02 (basic), 03; FR-NOT-02 to 04; FR-AUD-02; FR-OUT-02 (evidence upload); FR-UX-03, 06; institution funnel detail (FR-INST-02); field merge tool (FR-ADM-08); ops dashboard (FR-ADM-09).

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
| 6 | `mentor-suggestions-and-reasons` (the suggestions half of `matching-and-discovery`) | Pure scoring rule in `@connect/domain` for three of the four documented factors, weights and the batch distance in `@connect/config`, `GET /v1/suggestions` (student-only, five mentors, 1 to 3 reasons, `limited_information`), and the "Suggested for you" section on `/mentors`. The suggestion log stays DEBT-42 | `DONE` (archived 2026-11-11; gates green under `CI=true` — domain 113, web 141, contracts 19, api 220, 0 skipped; PR #40, merge `cbb9abc`; no migration; FR-DISC-02 built to depth and FR-DISC-06 guarded, D-91 to D-96 recorded, DEBT-33 and DEBT-34 closed, DEBT-26 re-pointed, DEBT-41 to DEBT-45 opened) |
| 7a | `request-draft-autosave` | The on-device request draft: a pure helper (`apps/web/lib/request-draft.ts`) with 24-hour expiry, a per-mentor key, a 400 ms debounce, a restored notice, clearing on a successful send, and clearing at both sign-out paths. No API, contract, schema or registry change | `DONE` (archived 2026-11-11; gates green under `CI=true` — domain 113, web 164, contracts 19, api 231, 0 skipped; PR #45, merge `288f1b8`; no migration; FR-REQ-02 built to depth and FR-UX-02 partial, D-104 to D-106 recorded, DEBT-48 to DEBT-50 opened; the manual browser pass in tasks 4.1 was not run) |
| 6b | `institution-admin-attestation` | The institution-admin decision surface (queue + verify/reject with a required reason), `requireInstitutionAdmin` with an MFA requirement and the institution scope, the platform-admin grant route, the demo admin seed with its production refusal, and `/institution/attestations`. `AGENTS.md` rule 12 amended (D-103) | `DONE` (archived 2026-11-11; gates green under `CI=true` — domain 113, web 153, contracts 19, api 231, 0 skipped; PR #43, merge `008c565`; no migration; FR-VER-02 built, D-97 to D-103 recorded, DEBT-19 and DEBT-35 closed, DEBT-46 and DEBT-47 opened; `AGENTS.md` rule 12 narrowed) |
| 6a | `outbox-and-job-runner` | `outbox_events`, pg-boss, the worker consumer, email through the queue with retry, and the outbox test event. **Sprint 3, before #7** | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, 265 tests with 0 skipped under `CI=true`; identity mail stays direct, DEBT-11) |
| 7 | `requests-and-48h-flow` | Structured request, capacity lock (rolling 7-day window), accept/decline/withdraw, 48h expiry and 24h reminder, queued request emails, `/requests` and the request form | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, 300 tests with 0 skipped under `CI=true`; acceptance creates no mentorship until #8 (closed by #8, DEBT-20); draft autosave closed by `request-draft-autosave`, 2026-11-11) |
| 8 | `mentorship-thread-and-sessions` | Mentorship on acceptance, agreement, thread, meeting link, held confirmations | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests run under `CI=true`; DEBT-20 and DEBT-17 closed, DEBT-21 recorded; `ENDED_EARLY`, `AD_HOC`, redaction, and read state stay unexposed) |
| 9 | `outcomes-and-verification` | Outcome state machine, append-only events, withdraw, conflict declaration. Evidence upload and scan move to DEBT-22 | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests under `CI=true`; report/confirm/dispute/conflict/withdraw, the append-only event and verification ledgers, the day 3/5/7 timers, and `OUT-Q1` as code; evidence endpoints documented but unbuilt, DEBT-22; counting stays with the next change) |
| 10 | `reputation-ledger-and-counting` | Counted outcomes, pair factor, snapshots and the replay guarantee, counts-only impact reads. **Split from `reputation-and-platform-review`** (D-66) | `DONE` (archived 2026-11-08; `pnpm lint`, `typecheck`, `test`, `build` green, all integration tests under `CI=true`; the counting job, one append-only event per counted outcome, the replayable snapshot, two counts-only impact reads, and every multiplier as a `1.0` placeholder, D-67; outcomes in review have no exit until the next row, DEBT-23) |
| 10a | `mentor-directory` | Public mentor directory (`GET /v1/mentors`), the BFF route and `/mentors` page, header links, and the dev-only demo seed. No rank, no migration | `DONE` (archived 2026-11-09; `pnpm lint`, `typecheck`, `build`, `test` green under `CI=true` — domain 87, web 110, contracts 17, api 185, 0 skipped; PR #28, merge `35d2987`; live BFF/API/browser checks passed; Stitch was unavailable, page follows existing patterns) |
| 10c | `request-validation-and-rate-limits` | API-wide body allowlist (`SEC-API-1`), `@nestjs/throttler` limits, and the `429 RATE_LIMITED` shape. Per-IP only (DEBT-27); independent of 10a/10b | `DONE` (archived 2026-11-09; gates green under `CI=true` — domain 87, web 110, contracts 19, api 194, 0 skipped; PR #30, merge `d1f6d98`; DEBT-01 and DEBT-12 closed, DEBT-02 narrowed, DEBT-27 opened) |
| 10b | `platform-review-queue` | Reviewer decisions with a written reason, `REJECTED`, clawback (`REVERSAL`), and the exit from `IN_PLATFORM_REVIEW`. **Follows #10** (D-66) | `DONE` (archived 2026-11-09; gates green under `CI=true` — domain 92, web 117, contracts 19, api 197, 0 skipped; PR #32, merge `706c610`; migration `0015`; DEBT-23 closed, DEBT-28 recorded) |
| 13 | `abuse-reports-and-sanctions` | `POST /v1/reports` (four target kinds, visibility-checked), the platform-admin report queue and one-shot resolution, the first admin write (`POST /v1/admin/accounts/{id}/suspend` with a reason and an optional end date that never lifts itself), `/admin/reports`, the thread Report control, and the post-session status re-check that closes DEBT-09 | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 132, contracts 19, api 211, 0 skipped; PR #38, merge `b5fed8b`; migration `0017`; FR-ADM-04 partial, FR-ADM-05 narrowed, FR-AUTH-10 built, D-87 to D-90 recorded, DEBT-09 closed, DEBT-40 opened) |
| 12 | `privacy-export-and-erasure` | `POST /v1/privacy/export` (one JSON document, fixed allowlist, no secrets), `POST /v1/privacy/delete` (a one-transaction tombstone that keeps the ledger), the `privacy_requests` tracking table, and both `/account` controls | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 127, contracts 19, api 204, 0 skipped; PR #36, merge `310291e`; migration `0016`; FR-PRIV-01 narrowed and FR-PRIV-02 built, D-84 to D-86 recorded, DEBT-39 opened) |
| 11 | `trust-surfaces` | Published, versioned consent documents (`/terms`, `/privacy`), an API-enforced `consent_accepted` at registration, the verified-badge disclaimer on every directory card and beside the impact summary, and the debt rows for the unbuilt Musts | `DONE` (archived 2026-11-10; gates green under `CI=true` — domain 92, web 123, contracts 19, api 198, 0 skipped; PR #34, merge `8dddcbb`; no migration; FR-CONS-01 partial, FR-VER-05 built, D-82 and D-83 recorded, DEBT-29 to DEBT-38 opened, DEBT-27 re-pointed at D-79) |

| — | `pwa-install-metadata` | The install identity of the web app: `apps/web/app/manifest.ts`, three PNG icons, the manifest/theme/apple-touch metadata in the root layout, and a test that freezes the key set, each icon's PNG size and the absence of a service worker. Also closes DEBT-50 as a docs correction | `DONE` (archived 2026-11-12; gates green under `CI=true` — domain 113, web 167, contracts 19, api 231, 0 skipped; PR #47, merge `b58cccf`; no migration; FR-UX-01 partial, D-107, D-108 and D-125 recorded, DEBT-37 narrowed, DEBT-50 closed; the install-on-device check is a manual step that was NOT run) |
| — | `institution-onboarding` | `POST /v1/institutions` (name, kind, country code, optional MoU date and domains, one transaction with one audit row per fact, `409 INSTITUTION_DOMAIN_TAKEN` on a duplicate in any case) and `GET /v1/institutions` for a platform admin with an enrolled second factor, plus `/admin/institutions` and its BFF route. No migration | `DONE` (archived 2026-11-12; gates green under `CI=true` — domain 113, web 175, contracts 19, api 240, 0 skipped; PR #49, merge `994cdc2`; no migration; FR-INST-01 partial, D-109 to D-113 recorded, DEBT-51 opened; Stitch not used, the page follows the report-queue pattern) |
| — | `response-reliability` | Response reliability on the mentor's own impact read: a pure `responseReliability` partition in `@connect/domain`, two integer counts (`requests_decided_in_time`, `requests_late_or_expired`) from one aggregate over `mentorship_requests`, a separate `OwnImpactResponse` so the public read is unchanged, and a not-enough-data line below `IMPACT_RELIABILITY_MIN_SAMPLE` (3). No migration | `DONE` (archived 2026-11-12; gates green under `CI=true` — domain 119, web 178, contracts 19, api 241, 0 skipped; PR #51, merge `cee79b3`; no migration; FR-REP-04 built, FR-REP-02 reliability item built, DEBT-25 closed, D-114 to D-117 recorded) |
| — | `per-account-rate-limit` | A second named throttler `account` keyed by the body email, then a session credential, then the address (SHA-256, no raw email in the key): sign-in 10 per hour, password reset 5 per hour, 120 per minute elsewhere. `@SkipThrottle` in its named form on the health probes, and the 429 boundary now reports the longest wait of the buckets that blocked. No migration | `DONE` (archived 2026-11-12; gates green under `CI=true` — domain 119, web 178, contracts 19, api 248, 0 skipped; PR #53, merge `8e8839e`; no migration; SEC-ABUSE-1 built for both keys, DEBT-27 closed, DEBT-02 satisfied, D-118 and D-119 recorded) |
| — | `break-glass-thread-read` | `POST /v1/admin/mentorships/{id}/break-glass-read` (PLATFORM_ADMIN + MFA, a required reason, one audit row written before the content, the participant projection of messages, agreement and sessions, a 500-message cap, `Cache-Control: no-store`), the report queue's nullable `mentorship_id`, and a "Read thread" disclosure on `/admin/reports`. No migration | `DONE` (archived 2026-11-12; gates green under `CI=true` — domain 119, web 187, contracts 19, api 254, 0 skipped; PR #55, merge `d441802`; no migration; FR-ADM-06 built for threads, FR-THR-03 complete, DEBT-30 closed, DEBT-52 to DEBT-54 opened, D-120 to D-124 recorded; an independent second review found two must-fix issues, both fixed before merge) |
| — | `outcome-transition-property-test` | `packages/domain/test/outcome-property.test.ts` (every pair against the data-model table, every two- and three-step sequence, and the invariant that no trace reaches `COUNTED` without a confirmation or a review decision) and `packages/contracts/test/reputation-schema-guard.test.ts` (the twelve forbidden score-shaped families, scanned over the contract and two schemas, with a four-entry allowlist). No production file changed | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 123, web 187, contracts 23, api 254, 0 skipped; no migration; FR-OUT-06 and FR-REP-05 built, DEBT-55 opened for the T6 drift between `docs/data-model.md` and the state machine; two mutation checks recorded in the change's tasks) |
| — | `consent-purposes-and-mentor-agreements` | `GET` and `POST /v1/me/consents` (one append-only row and one audit row per grant or withdrawal, `institution_id` required and affiliation-scoped for institution sharing), migration `0018` adding `mentor_profiles.orientation_completed_at`, the widened `mentorActivation` predicate with both documents and the orientation, the demo seed's agreements, `/consent` with its nav entry and the re-acceptance banner. No new table, no enum change | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 192, contracts 23, api 259, 0 skipped; migration `0018`; FR-CONS-01, FR-CONS-02 and FR-PROF-03 built, DEBT-18 and DEBT-36 closed, D-127 to D-130 recorded; five existing fixture files needed the agreements before they could still activate a mentor) |
| — | `institution-admin-assignment-ui` | The institution admin is assignable from the institution's own row: `POST /api/institutions/{id}/admins` in the BFF, an "Add admin" toggle with an email input, the assigned roles named on success, and the API's existing-account refusal mapped to its own line. No API, contract or schema change | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 196, contracts 23, api 259, 0 skipped; no migration; FR-INST-01 reads complete with the D-109 narrowing named, no debt row opened or closed) |
| — | `security-headers-csp-cors` | `helmet` 8.3.0 in the API with a strict enforcing policy, HSTS, nosniff, `no-referrer`, frame protection and `X-Powered-By` off, applied before the body parser; no CORS allowlist; the web app's five headers with a report-only CSP; both header sets asserted by tests and by a wiring assertion on `main.ts` | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 199, contracts 23, api 264, 0 skipped; no migration; SEC-API-3 built for the API and report-only on the web, SEC-API-4 on both, SEC-API-5 as an empty allowlist, D-131 to D-134 recorded, DEBT-56 and DEBT-57 opened, DEBT-03 stays open; one dependency added) |
| — | `ui-state-sweep` | One pure state module (`apps/web/lib/page-state.ts`) and the ten pages that carried no state branch: a loading line, an error line with `role="alert"` and a retry control, an empty line for reads, and a disabled control plus an in-flight line for submissions. No component, no token change, no API | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 208, contracts 23, api 264, 0 skipped; no migration; FR-UX-05 complete, FR-UX-04 stays Partial, no debt row opened or closed; `/mentorship/{id}` was left alone because `lib/mentorship-view.ts` already carries the same states) |
| — | `audit-log-search` | `GET /v1/admin/audit` for a platform admin with an enrolled second factor: six optional ANDed filters (actor, action, object type, object id, UTC date range), keyset on `(occurred_at, id)`, limit 1 to 100, and a projection that never selects `metadata`, `prev_hash` or `hash`. `/admin/audit` with the filters in the URL and its BFF route. No migration, no new index, one debt row | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 215, contracts 23, api 272, 0 skipped; no migration; FR-AUD-01 complete, SEC-AC-4's review loop names the page, D-135 to D-138 recorded, DEBT-58 opened for the action-filter scan)
| — | `sanction-lifecycle-warn-and-lift` | `POST /v1/admin/accounts/{id}/warn` (one `ACCOUNT_WARNED` row and one notice, no status change, a count derived from the log) and `.../reinstate` (one conditional update back to `ACTIVE` that clears the end date), one shared `liftSuspension`, and the `account-sanction` queue that lifts a passed end date every fifteen minutes and never an indefinite one. The report queue gains `warning_count`; `FR-ADM-05` is amended to warn, suspend, lift. No migration | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 125, web 216, contracts 23, api 277, 0 skipped; no migration; FR-ADM-05 complete for its amended scope, DEBT-40 closed, D-139 to D-142 recorded)
| — | `discovery-availability-filter` | The directory's fourth filter: `available_weekday`/`_start`/`_end`/`_timezone` (all four or none), converted to UTC on the request's own ISO week by one pure `zonedWindowToUtc` in `@connect/domain` and mirrored by an `AT TIME ZONE` SQL predicate, matched by overlap. The page gets the day, window, zone and clear controls and a filter-aware empty state. No migration | `DONE` (archived 2026-11-13; gates green under `CI=true` — domain 132, web 219, contracts 23, api 282, 0 skipped; no migration; FR-DISC-01 complete, DEBT-26 closed, DEBT-43 narrowed, D-143 to D-145 recorded)
| — | `suspended-account-directory-exclusion` | Every discovery query requires `users.status = 'ACTIVE'` (directory, suggestion pool, mentor context read, public impact read), derived on every read so either lift restores the listing with no profile write; a new request to an inactive account is `409 MENTOR_UNAVAILABLE` from the pause branch of `canCreateRequest`, after the field, self-request and affiliation branches, so no cause is disclosed; the profile report target follows the same rule; `syncMentorActivation` writes conditionally on the status it read. No migration, no new route | `DONE` (archived 2026-11-14; PR #67, merge `e7934e7`; gates green under `CI=true` — domain 133, web 219, contracts 23, api 289, 0 skipped; two mutation checks; D-147 to D-150 recorded, DEBT-59 opened) |

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
