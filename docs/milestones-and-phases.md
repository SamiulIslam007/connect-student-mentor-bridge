---
title: Milestones and Phases
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
sources: [README.md, connect-research-report.md (Sections 5, 6, 7, 9, 10)]
---

# connect: Milestones and Phases

> Truth labels follow README section 1.1. Nothing here is a delivery guarantee. Dates are relative (Week 1, Week 2 ...) until the owner sets a start date.

## Current state

| Field | Value |
|---|---|
| Updated | 2026-11-13 (update at every apply and every archive, `AGENTS.local.md` section 4) |
| Phase | 1a - MVP build (about 8 sprints, 1 week each, 3 working days) |
| Current sprint | **Sprint 8 (discovery) closed; hardening and register work next.** `mentor-suggestions-and-reasons` (#6, the suggestions half of `matching-and-discovery`) is archived, as are `institution-admin-attestation` (6b), `request-draft-autosave` (7a) and the five changes of the 2026-11-12 unattended run (`pwa-install-metadata`, `institution-onboarding`, `response-reliability`, `per-account-rate-limit`, `break-glass-thread-read`). An owner-approved unattended round of nine proposals starts with `register-and-docs-harmonisation`. |
| Last archived change | `break-glass-thread-read` (2026-11-12) - `DONE`: `POST /v1/admin/mentorships/{id}/break-glass-read` (PLATFORM_ADMIN + MFA, a required reason, one `THREAD_BREAK_GLASS_READ` audit row written before any content, the participant projection with the sessions and the agreement, a 500-message cap with `truncated`, `Cache-Control: no-store`), the queue's nullable `mentorship_id`, and the "Read thread" disclosure on `/admin/reports`. No migration; PR #55, merge `d441802`; FR-THR-03 complete, DEBT-30 closed, DEBT-52 to DEBT-54 opened; an independent second review returned two must-fix findings, both fixed before merge. `per-account-rate-limit` (2026-11-12) - `DONE`: a second named throttler keys sign-in at 10 per hour and password reset at 5 per hour per account (body email, then session, then address, all hashed), the module default stays 120 per minute, the health probes carry the named skip, and the 429 boundary reports the longest wait. No migration; PR #53, merge `8e8839e`; SEC-ABUSE-1 built for both keys, DEBT-27 closed, DEBT-02 satisfied, D-118 and D-119 recorded. `response-reliability` (2026-11-12) - `DONE`: `GET /v1/me/impact` returns `requests_decided_in_time` and `requests_late_or_expired` over every request the mentor has received, computed by the pure `responseReliability` and one SQL aggregate that the test pins to it; the public mentor read keeps its own schema, no percentage or score is sent, and the profile section shows a not-enough-data line below three requests. No migration; PR #51, merge `cee79b3`; FR-REP-04 built, DEBT-25 closed, D-114 to D-117 recorded. `institution-onboarding` (2026-11-12) - `DONE`: `POST /v1/institutions` and `GET /v1/institutions` (PLATFORM_ADMIN + MFA) with one transaction that writes the institution, one domain row per domain and one audit row per fact, `409 INSTITUTION_DOMAIN_TAKEN` on a duplicate in any letter case, `/admin/institutions` and `/api/institutions`. No migration; PR #49, merge `994cdc2`; FR-INST-01 partial, D-109 to D-113 recorded, DEBT-51 opened; Stitch not used. `pwa-install-metadata` (2026-11-12) - `DONE`: the install identity of the web app (`apps/web/app/manifest.ts` serving `/manifest.webmanifest`, three flat-tile PNGs in `apps/web/public` at 192, 512 and 512 maskable, manifest/theme/apple-touch metadata in the root layout through a `viewport` export, and a test freezing the key set, each icon's PNG header size and the absence of a service worker), plus the `COPY apps/web/public` line the web runtime image needed and the DEBT-50 correction. No migration; PR #47, merge `b58cccf`; FR-UX-01 partial, D-107, D-108 and D-125 recorded, DEBT-37 narrowed, DEBT-50 closed; the install-on-device check is a manual step that was NOT run. `request-draft-autosave` (2026-11-11) - `DONE`: the on-device request draft (`apps/web/lib/request-draft.ts`) with a per-mentor key, a 400 ms debounce flushed on unmount, a restored-draft notice, 24-hour expiry, clearing on a successful send, and clearing at both sign-out paths; storage failures degrade to a no-op. No API, contract, schema or registry change; PR #45, merge `288f1b8`; FR-REQ-02 built to depth, FR-UX-02 partial, D-104 to D-106 recorded, DEBT-48 to DEBT-50 opened; the manual browser pass (tasks 4.1) was not run. `institution-admin-attestation` (2026-11-11) - `DONE`: `GET /v1/institution/affiliations` (the caller's institutions' pending claims, email domain only) and `POST /v1/institution/affiliations/{id}/decide` (verify grants Level 1 with one audit row, one queued notice and a mentor activation sync, and revokes any other verified row; reject grants nothing; self-decision `403`, out of scope `404`, repeat `409 CLAIM_ALREADY_DECIDED`), `requireInstitutionAdmin` with the scope and MFA rules, `POST /v1/admin/institutions/{id}/admins`, the demo admin seed with its production refusal, `/institution/attestations`, and the narrowed `AGENTS.md` rule 12 (D-103). No migration; PR #43, merge `008c565`; FR-VER-02 built, DEBT-19 and DEBT-35 closed, DEBT-46 and DEBT-47 opened. `mentor-suggestions-and-reasons` (2026-11-11) - `DONE`: `GET /v1/suggestions` (student-only, at most five eligible mentors ordered by a pure three-factor score, then remaining capacity, then fewer requests in seven days, then a stable pair hash; one to three reasons and `limited_information` per entry; never a score), the bound `readSuggestionPool` on `ProfilesService` reusing the directory capacity rule, `MATCH_FACTOR_WEIGHTS` and `MATCH_ALUMNI_BATCH_DISTANCE = 0` in `@connect/config`, `STUDENT_PROFILE_REQUIRED`, the "Suggested for you" section on `/mentors`, and the `/api/suggestions` BFF route. No migration; PR #40, merge `cbb9abc`; FR-DISC-02 built to depth, FR-DISC-06 guarded, D-91 to D-96 recorded, DEBT-33 and DEBT-34 closed, DEBT-26 re-pointed, DEBT-41 to DEBT-45 opened. `abuse-reports-and-sanctions` (2026-11-10) - `DONE`: `POST /v1/reports` (user, message, profile, or outcome the reporter can see; a hidden target is `404`), `GET /v1/reports` and `POST /v1/reports/{id}/resolve` (PLATFORM_ADMIN + MFA, one resolution, `409 REPORT_ALREADY_RESOLVED`, one audit row, one queued reporter email), `POST /v1/admin/accounts/{id}/suspend` (reason + optional end date, every session revoked in the same transaction, notice queued, never lifted automatically, D-88), `/admin/reports`, the thread Report control, `users.suspended_until` (migration `0017`), and the post-session status re-check (D-89, DEBT-09 closed). PR #38, merge `b5fed8b`; FR-AUTH-10 built, FR-ADM-04 partial, FR-ADM-05 narrowed, DEBT-40 opened. `privacy-export-and-erasure` (2026-11-10) - `DONE`: `POST /v1/privacy/export` (one synchronous JSON document from a fixed allowlist, `Cache-Control: no-store`, no password, factor, or session secrets, D-84) and `POST /v1/privacy/delete` (one transaction: `ANONYMIZED`, keyed email hash, `Deleted user`, empty profile text, mentor profile `REMOVED`, the caller's own message bodies tombstoned, sessions and second factors deleted, one audit entry and one `privacy_requests` row, ledger untouched, D-85; confirmed by repeating the account email, D-86), migration `0016`, both `/account` controls. PR #36, merge `310291e`; FR-PRIV-02 built, FR-PRIV-01 narrowed, DEBT-39 opened. `trust-surfaces` (2026-11-10) - `DONE`: session-free `/terms` and `/privacy` rendering `CONSENT_DOCUMENT_VERSION`, an API-enforced `consent_accepted` at registration (`422` naming the field, no user and no consent row written, D-82), one verified-badge disclaimer on every directory card and beside the impact summary (D-83), the debt rows DEBT-29 to DEBT-38 for the unbuilt Musts, and the D-79 per-account correction. No migration; PR #34, merge `8dddcbb`; FR-CONS-01 partial, FR-VER-05 built. `platform-review-queue` (2026-11-09) - `DONE`: `GET /v1/review-queue` (PLATFORM_ADMIN + MFA), `POST /v1/outcomes/{id}/review` with a written reason (`valid` counts with a platform basis, `invalid` rejects, `invalid` on `COUNTED` reverses with one compensating ledger row and a decremented snapshot), participant-visible decisions, migration `0015`, and `/admin/reviews`. PR #32, merge `706c610`; DEBT-23 closed, DEBT-28 recorded. `request-validation-and-rate-limits` (2026-11-09) - `DONE`: one body allowlist interceptor with contract parity, `@nestjs/throttler` placeholder limits per IP, `429 RATE_LIMITED` + `Retry-After` (also for the identity library's raw 429), and a 100 KiB body cap; DEBT-01 and DEBT-12 closed, DEBT-02 narrowed, DEBT-27 opened for the per-account bucket. PR #30, merge `d1f6d98`. `mentor-directory` (2026-11-09) - `DONE`: public `GET /v1/mentors` (ACTIVE, non-paused, derived `available`/`application_only`/`full`, fixed projection, field/language/access-state filters, keyset pagination), the BFF route and `/mentors` page, `Mentors`/`Requests` header links, a `Find a mentor` link, and the guarded dev-only `db:seed:demo`. No migration; PR #28, merge `35d2987`. `reputation-ledger-and-counting` (2026-11-08) - `DONE`: `reputation_events` and `field_impact_snapshots` with the `reputation_event_type` enum and split grants (migration `0014`), the ten-minute `reputation-counter` queue, the cooling-to-counting guard, one append-only event per counted outcome with the applied multipliers copied, an additive snapshot the replay test reproduces exactly, `GET /v1/me/impact` and `GET /v1/mentors/{id}/impact` as counts only, and the impact section on the profile page. Every weight is a `1.0` placeholder (D-67) and no score is exposed. `outcomes-and-verification` (2026-11-08) - `DONE`: `outcomes`, `outcome_events`, and `verification_records` with five enums, checks, indexes and split grants (migration `0013`), the seven-state transition function, report/confirm/dispute/conflict/withdraw, one gap-free event and one audit row per transition, the day 3/5/7 timers on the five-minute sweeper, and `OUT-Q1` as an executable predicate (D-63). Evidence endpoints stay documented-but-unbuilt (DEBT-22). `mentorship-thread-and-sessions` (2026-11-08) - `DONE`: `mentorships`, `thread_messages`, and `mentorship_sessions` with three enums, checks, indexes and app-role grants (migration `0012`), the mentorship created inside the accept transaction (D-60), participant-only mentorship reads, the agreement with per-party acknowledgement, the keyset thread with one outbox email per message (D-62), sessions with an https-only link and mutual held confirmation, completion, the resume capacity check (D-61, closes DEBT-17), and the `/mentorship/{id}` page. `requests-and-48h-flow` (2026-11-08) - `DONE`: `mentorship_requests` with its enums, checks, one-pending-per-pair index and app-role grant (migration `0011`), `POST/GET /v1/requests` plus accept/decline/withdraw, the rolling 7-day capacity window under a mentor row lock (D-59), `APPLICATION_ONLY` note enforcement, the 5-minute reminder/expiry sweeper over outbox email events, the request form and the sent/received lists, and `GET /v1/mentors/{id}` for the form. Acceptance does not create a mentorship until #8 (DEBT-20) `outcome-transition-property-test` (2026-11-13) - `DONE`: the transition property test (42 pairs against the data-model table, two- and three-step walks, the invariant that `COUNTED` needs a confirmation or a review decision) and the reputation schema guard (twelve forbidden families over the contract and two schemas, four allowlisted names); no production file changed, no migration; FR-OUT-06 and FR-REP-05 built, DEBT-55 opened for the T6 drift. `consent-purposes-and-mentor-agreements` (2026-11-13) - `DONE`: one signed-in consent route pair for all five purposes (append-only, one audit row per record, `institution_id` scoped to the caller's affiliations), the re-acceptance banner, migration `0018` (`mentor_profiles.orientation_completed_at`), and the widened activation predicate that needs the volunteer agreement, the community guidelines and the orientation. PR #59; FR-CONS-01, FR-CONS-02 and FR-PROF-03 built, DEBT-18 and DEBT-36 closed, D-127 to D-130 recorded. `institution-admin-assignment-ui` (2026-11-13) - `DONE`: the institution admin is assigned from `/admin/institutions` (a per-row "Add admin" control, the roles named on success, the existing-account refusal given its own line) through the existing grant route; FR-INST-01 reads complete with the D-109 narrowing named. No API, contract, schema or migration change. `security-headers-csp-cors` (2026-11-13) - `DONE`: `helmet` 8.3.0 sends a strict enforcing policy, HSTS, nosniff, `no-referrer` and frame protection on every API response, applied before the body parser; no CORS allowlist by decision; the web app sends five headers with a report-only CSP; SEC-API-3/4/5 annotated, DEBT-56 and DEBT-57 opened, DEBT-03 left open, D-131 to D-134 recorded. One dependency added. `ui-state-sweep` (2026-11-13) - `DONE`: one pure state module (`apps/web/lib/page-state.ts`: the `idle`/`loading`/`error`/`empty`/`ready` union with `beginLoad`, `beginSubmit`, `settleSuccess`, `settleFailure` and `stateKey`) and the ten pages that carried no state branch (`/account/security`, `/account/sessions`, `/profile`, `/request/new`, `/sign-in`, `/sign-up`, `/sign-in/mfa`, `/forgot-password`, `/reset`, `/verify`): a loading line, an error line with `role="alert"` and a retry control, an empty line for reads, and a disabled control plus an in-flight line for submissions. No migration; FR-UX-05 complete, FR-UX-04 stays Partial; `/mentorship/{id}` was left alone because `lib/mentorship-view.ts` already carried the same states. |
| In flight | None. `ui-state-sweep` is archived and `main` is green |
| Next change | `audit-log-search`, then `sanction-lifecycle-warn-and-lift`, then `discovery-availability-filter`, then `register-annotation-cleanup` (owner-approved unattended round). Evidence upload (DEBT-22) is still the oldest unbuilt row. |
| Open blockers | None |

## 1. Purpose and scope

This document defines the phases of connect, the scope of each phase, the **evidence to review before moving to the next phase**, what is excluded, and how the MVP is built in about two months of part-time work using spec-driven OpenSpec sprints.

It expands README section 15 and the research report sections 7 (doc 16) and 9.

## 2. Planning assumptions

| # | Assumption | Label |
|---|---|---|
| P1 | The first MVP (README Phase 1 core workflow, trimmed) should be built in **about 2 months**: **8 one-week sprints** with a **3-day working week** per sprint. Sprint 0 is setup; sprints 1 to 7 build and harden the core. | **Plan target** (owner decision) |
| P2 | One builder (the owner/CTO) working with AI coding agents. No second developer. | Plan target |
| P3 | About **3 days per week** of focused capacity. If capacity is lower than planned, **scope is cut, not quality** (see section 5.3). | **Owner decision** |
| P4 | Phase 1 stack: Next.js PWA, NestJS modular monolith, PostgreSQL with Drizzle ORM (TypeScript schema, `drizzle-kit` migrations), better-auth, pg-boss, Docker Compose, transactional email. No Flutter, Redis, WebSocket, FastAPI, Zoom API, or AI. | **Owner decision** (ADR-002, 003, 006, 016, 018) |
| P5 | Everything runs in **Docker** from day one; local development depends on Docker Compose. CI (lint, type-check, tests, build) is created at the start. Hosting is chosen after the MVP and does not block Gate 0. | **Owner decision** |
| P6 | Pilot users are **18+ only**. Product UI and docs are **English only**; UI strings still go through a string catalog. Launch country is **Bangladesh**. | **Owner decisions** |
| P7 | Method is **spec-driven development with OpenSpec**, used through OpenCode or Claude Code. Sprint length is **1 week until the MVP/pilot launches**, then **2 weeks** during the pilot. | **Owner decision** |
| P8 | Effort ranges below are estimates, not measurements. Re-baseline after Sprint 1 using real velocity. | **Proposed default** |

## 3. Gate 0 and the phase overview

### 3.1 Gate 0 (lightweight): coding may start

Gate 0 is deliberately small. It is passed when **all** of these are true:

1. [x] The contradictions fixed in the 2026-10-29 resolution run stay fixed (see `docs/audit/08-resolution-report.md`).
2. [x] `AGENTS.md` exists.
3. [x] `docs/decision-log.md` exists with this run's decisions.
4. [x] `docs/mvp-build-plan.md` exists.
5. [x] These documents are marked **Approved (MVP baseline, owner decision)**: `README.md`, `glossary.md`, `assumptions-and-open-questions.md`, `functional-requirements.md`, `data-model.md`, `api-contracts.md`, `auth-and-access-control.md`, `security-requirements.md`, `milestones-and-phases.md`, plus the decided ADRs (ADR-018 Drizzle ORM, which supersedes the ORM choice in ADR-002, ADR-003 better-auth, ADR-006 no Redis/WebSocket with pg-boss, ADR-016 Docker, ADR-017 Agile).

Gate 0 passed on 2026-10-29. The boxes above are kept as history, not as a live gate.

All other documents stay **Draft** and are refined while building. Hosting, pilot partner type, pricing, legal entity, counsel, willingness-to-pay, brand clearance, data residency, and trust-and-safety staffing are **not** Gate 0 conditions.

### 3.2 Phase overview

| Phase | Name | Main scope | Exit gate (evidence to review) |
|---|---|---|---|
| **0** | Discovery and documentation | This documentation set and the decisions in the decision log | **Gate 0** as defined in 3.1 |
| **1a** | **MVP build (about 8 weeks, 3 days/week)** | Core workflow end to end in Docker: auth, profiles, dynamic fields, matching, requests, decisions, threads, meeting link, outcomes, reputation, admin review, basic institution dashboard | **Gate 1 (MVP acceptance)**: checklist in section 5.5 |
| **1b** | Pilot readiness | Cut items, accessibility pass, mentor verification operating, Terms, Privacy Notice, consent screens, backup-restore test, runbook | **Gate 2 (before real users)** |
| **Pilot run** | Controlled pilot | 1 partner, 30 mentors, 100 students, **12 to 16 weeks** | **Gate 3**: KPIs compared with plan targets |
| **2** | Measurement and validation | KPI instrumentation, weight tuning, full institution reports, structured community | Evidence supports the model; letters of intent sought |
| **3** | Institutional expansion, employers, payments | More institutions, SSO on demand, employer portal, `PaymentProvider` (payments last) | Renewal signals and revenue assumptions reviewed |
| **4** | Own the call layer (as needed) | WebRTC (LiveKit direction) | Meeting-link cost or experience justifies it |
| **5** | AI-assisted features | Assist, then embeddings, behind human review | Workflow validated; consent and retention approved |

Mapping to README: README Phase 1 = our 1a + 1b + the pilot run. The partner-validation track (interviews, mentor recruitment, counsel) runs in parallel and is **not** on the Gate 0 critical path.

## 4. Agile working model (solo builder plus agents)

| Element | Rule |
|---|---|
| Sprint length | **1 week** until the MVP/pilot launches (8 sprints, Sprint 0 to Sprint 7), then **2 weeks** during the pilot. About 3 working days per sprint. |
| Spec method | **Spec-driven development with OpenSpec**. Each sprint's items start as an OpenSpec change proposal, then a spec, then implementation. |
| Backlog | One ordered backlog in the repository. Each item references a requirement ID from `functional-requirements.md`. |
| Sprint planning | Day 1 of each sprint, 30 minutes. Pick items that fit 3 days. Write the acceptance test (Given/When/Then) before coding. |
| Work in progress | **Maximum 2 items in progress.** Finish before starting. |
| Definition of Ready | The OpenSpec change proposal exists and is reviewed; acceptance test written; no unresolved Open decision blocks it; the governing document is Approved. |
| Definition of Done | Spec and tests written first; code merged; pure domain rules unit-tested; API contract updated and client regenerated; runs in Docker Compose; acceptance test passes; no secrets or real user data in code or logs; docs updated. |
| Sprint review | Last day, 20 minutes. Demo on the local Docker stack (hosting may not exist yet). |
| Retrospective | 15 minutes. Write 3 lines in `docs/decision-log.md`: keep, stop, try. |
| Daily rhythm | 5-minute written plan at start, 5-minute note at end. Keeps agent runs and your decisions traceable. |
| Agent rules | Agents work on feature branches only, never push or merge to `main`, never touch secrets (see `AGENTS.md`). A human reviews every pull request touching auth, consent, ledgers, or privacy. |
| Change control | Changing an Approved doc needs an entry in `docs/decision-log.md`. |

## 5. Phase 1a: MVP build (8 one-week sprints)

### 5.1 Principles for the MVP

1. **Walking skeleton early.** By the end of Sprint 2, one thin path works end to end locally in Docker (sign-up to mentor decision).
2. **Trust core is not trimmed.** The outcome state machine, append-only ledger, and "unconfirmed never counts" rule ship in the MVP even if the UI is plain.
3. **Boring technology.** Fewer moving parts, typed contracts, pure functions for rules.
4. **Cut features, not safety.** Authorization checks, consent capture, audit log, and age gate are never cut.
5. **Spec first.** Each sprint begins with OpenSpec change proposals; the first ten are listed in `docs/mvp-build-plan.md`.

### 5.2 Sprint plan (3 working days per sprint)

| Sprint | Goal | Requirements | Technical work | Demo at sprint end |
|---|---|---|---|---|
| **0** | Setup and skeleton | - | GitHub repository, CI (lint, type-check, tests, build), monorepo, Docker Compose (Postgres, object store, mail catcher, ClamAV scanner), `packages/domain` skeleton, email adapter, OpenSpec initialized, `AGENTS.md`. The Drizzle schema/migration and the email adapter landed with change #2; the outbox + pg-boss runner and its retry path land with `outbox-and-job-runner` (6a, Sprint 3) | `docker compose up` starts the stack; CI is green; the email adapter delivers a real verification email to Mailcatcher. The outbox → job → mail-catcher demo moved to `outbox-and-job-runner` (Sprint 3) |
| **1** | Identity core (changes #2, #3 and #4 shipped) | FR-AUTH-01, 03, 05 (partial); FR-PROF-01, 02 (partial); FR-CONS-01 (basic); FR-AUD-01 (basic); FR-VER-01 (seed only, partial) | **Shipped by change #2:** better-auth with email/password, verification and forgot-password, 18+ gate, Postgres sessions, `institutions` and `institution_domains` seeded, consent records, string catalog. **Shipped by change #3:** `account_status` lifecycle and the blocked-signup check. **Shipped by change #4:** student and mentor profile CRUD, dynamic fields with a normalized slug, `GET /v1/fields`, profile saves, and the `/v1/me` profile extension | Sign up, verify email, pass the age gate, sign in and sign out. Creating a student or mentor profile with a self-created field shipped with change #4 |
| **2** | Access, affiliation, discovery | FR-AUTH-02, 04, 06, 07; FR-PROF-01, 02 residual (availability, `access_mode`); FR-PROF-03, 04, 05; FR-VER-01, 04, 05; FR-CONS-02; FR-DISC-01 to 03, 06 | `access-google-mfa-and-sessions` (4a) first: Google sign-in, MFA enrollment, session list and revoke; `account-access-ui`: the signed-in header, the enrollment page, and the session list reachable by clicking; `roles-and-profile-visibility` (4c): role authorization, profile visibility, and role-keyed MFA; `profile-availability-and-access-mode` (4b) before discovery: availability windows, `access_mode`, pause/resume; then #5 institutional-email affiliation and the mentor activation gate; #6 pure match function with tests and the discovery list; badge disclaimer and revocable institution-sharing consent | A mentor is activated after affiliation and MFA; availability and access mode are stored. Discovery (#6, "a student sees suggested mentors with reasons") is deferred by D-58, so this demo does not promise it |
| **3** | Outbox, requests, notifications | FR-REQ-01, 02, 03 (accept/decline), 05 to 08; FR-NOT-01 | `outbox-and-job-runner` (6a) first: `outbox_events`, pg-boss, the worker consumer, and email through the queue with retry; then request creation with idempotency, capacity row lock, accept/decline/withdraw, 48h expiry and 24h reminder sweeper, email templates and de-duplication | The worker delivers a queued test email with a retry on failure; a student sends a request, a mentor accepts or declines; an ignored request gets one reminder and expires |
| **4** | Mentorship, thread, session | FR-MEN-01, 02; FR-THR-01, 02; FR-SES-01, 02 | **Shipped by #8 (2026-11-08):** mentorship on acceptance in the request transaction (D-60), the lightweight agreement with per-party acknowledgement, the participant-only keyset thread with one queued email per message (D-62), the session record with an https-only mentor link and mutual held confirmation, cancellation with a reason, completion, and the resume capacity check (D-61); the `/mentorship/{id}` page reuses the existing tokens and the string catalog | Student and mentor exchange messages, record a session with a link, both confirm it was held |
| **5** | Outcomes | FR-OUT-01 to 07, 09, 11 | **Shipped by #10 split (2026-11-08):** the `reputation-counter` job (every ten minutes) promoting cooled `CONFIRMED` outcomes, one append-only reputation event per counted outcome with the applied multipliers, the replayable field snapshot, and the counts-only impact reads plus the profile section. Every weight is a `1.0` placeholder and no numeric score is exposed. **Shipped by #9 (2026-11-08):** the seven-state machine as one pure function, `outcomes` plus the append-only `outcome_events` and `verification_records` (insert-and-select only), report/confirm/dispute/conflict/withdraw, one audit row per transition, the day 3 and day 5 reminders and the day 7 escalation riding the five-minute sweeper, and `earnsMentorReputation` encoding D-63. Evidence upload and scanning move to DEBT-22; counting is the next change | Student reports an outcome, mentor confirms or disputes, a withdrawn outcome never counts |
| **6** | Reputation and impact | FR-OUT-10; FR-REP-01 to 05, 07 | Reputation ledger, pair factor `1/(1+n)`, cooling and counting sweeper, snapshots, confidence tiers, clawback, counts-only public view | Mentor impact view shows counted outcomes; replaying the ledger reproduces it |
| **7** | Admin, privacy, hardening | FR-ADM-01, 03 to 07; FR-VER-02 (attestation queue); FR-PRIV-01, 02; FR-AUD-01; FR-UX-01, 02, 04, 05; FR-NOT-03, 04 | Platform review queue with written reason, institution attestation queue, audit sampling, moderation, sanctions, break-glass, versioned config, export and download, deletion intake and ledger-safe pseudonymization, audit log, accessibility pass, rate limits, restore drill, runbook, Terms and Privacy Notice drafts | A platform admin resolves a case with a written reason; an institution admin attests an affiliation; export and deletion can be requested and tracked; restore performed |

**Sprint 1 partials and their homes:**

- **FR-AUTH-05**: password reset, sign-out-everywhere, the session list and per-session revoke all ship; the list and revoke landed with `access-google-mfa-and-sessions` (4a).
- **FR-AUTH-02 / FR-AUTH-04**: Google sign-in and TOTP enrollment/verification ship with 4a. Enforcement keyed on a role (Mentor, Institution Admin, Platform Admin) needs the role model, so it ships with `roles-and-profile-visibility` (4c) before #5.
- **FR-PROF-01**: goals, primary/interest fields, and languages ship; availability windows move to `profile-availability-and-access-mode` (4b) and institution affiliation to `affiliation-and-mentor-onboarding` (#5).
- **FR-PROF-02**: profile content and the capacity bound ship; availability and `access_mode` move to 4b, and capacity enforcement (the row lock and `CAPACITY_BELOW_ACTIVE`) to `requests-and-48h-flow` (#7).
- **FR-VER-01**: only the institution/domain seed ships; the claim flow moves to #5.
- **FR-CONS-01**: registration writes `TERMS` and `PRIVACY_NOTICE`; the volunteer agreement, community guidelines, and institution-sharing purposes arrive with their owning changes.
- **FR-AUD-01**: authentication events are written; the append-only FK, failed-audit fail-closed path, and request-id gaps are closed by `sprint1-hardening-and-plan-closure`; disputes, admin actions, and exports are audited by their later changes.

### 5.3 Pre-agreed cut order (if behind schedule)

Cut from the top. Items below the line are never cut.

1. The institution dashboard (FR-INST-01 to 03) is **Phase 1b** by default; build it only if Sprints 1 to 7 finish early.
2. Evidence upload (FR-OUT-02) moves to Phase 1b; the MVP supports Tier 0 only. If it is cut, `evidence_tier` stays 0 and no file endpoint ships.
3. Session records (FR-SES-01, 02) and the mentorship agreement (FR-MEN-01) move to Phase 1b; the thread alone carries the mentorship.
4. The in-app notification list and preferences (FR-NOT-02, 03) move to Phase 1b; email remains.
5. The mentor impact view shows counts only; confidence tier labels follow in Phase 1b.

**Never cut:** Google and password sign-in, the 18+ gate, Level 1 affiliation gate, the 48-hour expiry and 24-hour reminder, outcome state machine enforcement, append-only ledger, audit log, consent records, privacy export, object-level authorization, backup and restore test.

### 5.4 Weekly checkpoints

| Sprint | Checkpoint question |
|---|---|
| 0 | Does the app start with one `docker compose up` on a clean machine, and is CI green? |
| 1 | Can a new user sign up, pass the 18+ gate, and create a profile with a self-created field? |
| 2 | Is a mentor activated after affiliation and MFA, and does a student see suggested mentors with reasons? |
| 3 | Can a mentor decide on a request, and does an undecided request expire at 48 hours? |
| 4 | Does a student receive an email when the mentor decides, and does the thread stay participant-only? |
| 5 | Does the state machine reject every illegal outcome transition in tests? |
| 6 | Does replaying the reputation ledger reproduce the snapshot exactly? |
| 7 | Can a platform admin resolve a case with a written reason while an institution admin cannot, and was a backup restored? |

### 5.5 MVP acceptance (Gate 1)

- [ ] A new user can sign up with Google or email and password, verify email, pass the 18+ gate, and complete a profile.
- [ ] A mentor with Level 1 affiliation can receive requests; an unverified mentor cannot.
- [ ] Students and mentors create or pick fields; no hard-coded field list is required.
- [ ] A student can send a structured request; the mentor can accept or decline; the request expires at 48 hours.
- [ ] Async thread works between participants only (object-level authorization tested).
- [ ] A student can report an outcome; a mentor can confirm, amend contribution, or dispute; **unconfirmed outcomes never change reputation** (tested).
- [ ] Reputation is recomputed from the append-only ledger and gives the same result each time.
- [ ] A platform admin can resolve a dispute with a reason; institution admins cannot edit outcomes.
- [ ] Consent records and audit log entries are written for the required events.
- [ ] Data export (with download) and deletion requests can be created and tracked.
- [ ] The whole system runs from `docker compose up` locally, and CI builds the images.
- [ ] CI green: lint, type-check, unit tests, API contract tests, one end-to-end test of the happy path.
- [ ] No open decision blocks the above.

Passing Gate 1 means **MVP code complete for internal and test use**. It does **not** mean real pilot users may be onboarded. That requires Gate 2.

## 6. Phase 1b: pilot readiness (after Sprint 7, partly in parallel)

| Workstream | Deliverables | Needs |
|---|---|---|
| Legal and privacy | Terms, Privacy Notice, consent text, volunteer mentor agreement, partner MoU | `legal-and-compliance-checklist.md`, `data-privacy-and-retention.md` |
| Operations | Support inbox, runbook, on-call statement, restore drill repeated | `production-requirements.md` |
| Product polish | Cut items from 5.3, accessibility pass (WCAG 2.1 AA), low-end Android and slow-network pass | Sprint 7 leftovers |
| Recruitment | 30 mentors verified, 100 students invited by partner | Partner MoU signed |

**Deferred (owner decision), not in Phase 1b:** AI assist, trust-and-safety reviewer hire, data-residency answer, legal entity, counsel engagement beyond the pilot documents, willingness-to-pay work, buyer interviews, mentor-recruitment experiments, brand clearance.

**Estimated duration:** 2 to 4 weeks, but it is gated by partner timelines, which are outside engineering control. **Label:** Proposed default.

## 7. Parallel tracks (non-engineering)

These matter for the pilot but are **not** on the Gate 0 critical path.

| Track | Start | Needed by | Owner |
|---|---|---|---|
| Pilot partner conversations (university, department, or bootcamp; type stays open) | Now | Before Gate 2 | Owner |
| Mentor recruitment (assumption A2) | Any time | Before Gate 2 | Owner |
| Buyer interviews on willingness to pay (assumption A7) | **Deferred** until after the pilot | Phase 2 | Owner |
| Entity and payments advice (SSLCommerz Bangladesh, Stripe foreign) | **Deferred** until payments are planned | Phase 3 | Owner with counsel and accountant |
| Counsel engagement for Terms and Privacy Notice | Before Gate 2 | Before real users | Owner |

## 8. Kill and pivot criteria

The triggers below are kept from `pilot-plan.md` as **Proposed defaults**. They are confirmed by the owner **before the pilot starts**, so they are not rationalized afterward. Values are not set in this document.

- If fewer than X verified mentors are recruited after Y weeks, pause and reassess the partner.
- If match acceptance stays under Z% for N consecutive weeks, review matching and request quality before scaling.
- If fewer than W% of reported outcomes are confirmed within 7 days, review mentor reminders and workload.

## 9. Dependencies and risks specific to the schedule

| Risk or dependency | Effect | Mitigation |
|---|---|---|
| Eight one-week sprints at 3 days/week is tight | Schedule slips | Pre-agreed cut order (5.3); re-baseline after Sprint 1; cut features, not safety |
| Agent-generated code is wrong or inconsistent | Rework | Short `AGENTS.md`, spec-first with OpenSpec, tests before merge, human review of trust-core code |
| Auth wiring takes longer than planned | Sprint 1 slips | better-auth is decided; keep the `IdentityService` seam; time-box to 2 days |
| Partner delays | Pilot start slips even if code is ready | Start conversations now; use test users only until Gate 2 |
| Owner capacity changes | Schedule slips | Re-plan at sprint boundaries |
| Microservices, GraphQL, or serverless added early | Complexity grows beyond one builder | See section 10 |

## 10. Architecture style: confirmed

The **modular monolith with REST (OpenAPI), in a Docker-based monorepo**, is confirmed (ADR-001, ADR-011, ADR-016). Microservices, GraphQL, and serverless are **not** part of the Phase 1 plan. The module boundaries (identity, profiles, matching, requests, mentorships, outcomes, reputation, notifications, institutions, admin, audit) are drawn so a module can later become a separate service with limited rework.

## 11. Post-MVP phases (summary)

Phases 2 to 5 are summarized in section 3. Each will get its own scope note before it starts. Candidate Phase 2 items already known: Flutter decision, Redis and WebSocket if a measured need appears, FastAPI for a first analytics workload, full institution reports, structured community circles, private session feedback (FR-FBK-01), verifiable credential export design.

## 12. Acceptance checklist for this document

- [ ] Every phase has scope, exclusions, exit evidence, and dependencies.
- [ ] Sprint plan items trace to requirement IDs in `functional-requirements.md`.
- [ ] No date is stated as a commitment.
- [ ] Cut order and "never cut" list are agreed.
- [ ] Kill and pivot criteria are confirmed before the pilot.

## 13. Questions for Owner

1. What is the Sprint 1 start date?
2. Do you accept the cut order in 5.3?
3. Which partner type do you want to approach first: university, department, or bootcamp? (Not a Gate 0 blocker.)
