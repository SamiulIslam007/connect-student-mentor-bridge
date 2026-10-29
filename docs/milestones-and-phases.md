---
title: Milestones and Phases
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
sources: [README.md, connect-research-report.md (Sections 5, 6, 7, 9, 10)]
---

# connect: Milestones and Phases

> Draft for Owner review. Truth labels follow README section 1.1. Nothing here is a delivery guarantee. Dates are relative (Week 1, Week 2 ...) until the owner sets a start date.

## 1. Purpose and scope

This document defines the phases of connect, the scope of each phase, the **evidence to review before moving to the next phase**, what is excluded, and how the MVP is built in about two months of part-time work using spec-driven OpenSpec sprints.

It expands README section 15 and the research report sections 7 (doc 16) and 9.

## 2. Planning assumptions

| # | Assumption | Label |
|---|---|---|
| P1 | The first MVP (README Phase 1 core workflow, trimmed) should be built in **about 2 months**: **8 one-week sprints** with a **3-day working week** per sprint. Sprint 0 is setup; sprints 1 to 7 build and harden the core. | **Plan target** (owner decision) |
| P2 | One builder (the owner/CTO) working with AI coding agents. No second developer. | Plan target |
| P3 | About **3 days per week** of focused capacity. If capacity is lower than planned, **scope is cut, not quality** (see section 5.3). | **Owner decision** |
| P4 | Phase 1 stack: Next.js PWA, NestJS modular monolith, PostgreSQL with Prisma, better-auth, pg-boss, Docker Compose, transactional email. No Flutter, Redis, WebSocket, FastAPI, Zoom API, or AI. | **Owner decision** (ADR-002, 003, 006, 016) |
| P5 | Everything runs in **Docker** from day one; local development depends on Docker Compose. CI (lint, type-check, tests, build) is created at the start. Hosting is chosen after the MVP and does not block Gate 0. | **Owner decision** |
| P6 | Pilot users are **18+ only**. Product UI and docs are **English only**; UI strings still go through a string catalog. Launch country is **Bangladesh**. | **Owner decisions** |
| P7 | Method is **spec-driven development with OpenSpec**, used through OpenCode or Claude Code. Sprint length is **1 week until the MVP/pilot launches**, then **2 weeks** during the pilot. | **Owner decision** |
| P8 | Effort ranges below are estimates, not measurements. Re-baseline after Sprint 1 using real velocity. | **Proposed default** |

## 3. Gate 0 and the phase overview

### 3.1 Gate 0 (lightweight): coding may start

Gate 0 is deliberately small. It is passed when **all** of these are true:

1. [ ] The contradictions fixed in the 2026-10-29 resolution run stay fixed (see `docs/audit/08-resolution-report.md`).
2. [ ] `AGENTS.md` exists.
3. [ ] `docs/decision-log.md` exists with this run's decisions.
4. [ ] `docs/mvp-build-plan.md` exists.
5. [ ] These documents are marked **Approved (MVP baseline, owner decision)**: `README.md`, `glossary.md`, `assumptions-and-open-questions.md`, `functional-requirements.md`, `data-model.md`, `api-contracts.md`, `auth-and-access-control.md`, `security-requirements.md`, `milestones-and-phases.md`, plus the decided ADRs (ADR-002 Prisma, ADR-003 better-auth, ADR-006 no Redis/WebSocket with pg-boss, ADR-016 Docker, ADR-017 Agile).

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
| **0** | Setup and skeleton | — | GitHub repository, CI (lint, type-check, tests, build), monorepo, Docker Compose (Postgres, object store, mail catcher, ClamAV scanner), Prisma base schema, `packages/domain` skeleton, outbox + pg-boss + email adapter, OpenSpec initialized, `AGENTS.md` | `docker compose up` starts the stack; CI is green; a test event travels outbox → job → mail catcher |
| **1** | Identity core and profiles | FR-AUTH-01, 03, 05; FR-PROF-01, 02; FR-VER-01 (seed only); FR-CONS-01 (basic); FR-AUD-01 (basic) | better-auth with email/password, verification and forgot-password, 18+ gate, `account_status`, profile CRUD, dynamic fields with normalized slug, `institutions` and `institution_domains` seeded, consent records, string catalog | Sign up, verify email, pass the age gate, create a student or mentor profile with a self-created field |
| **2** | Access, affiliation, discovery | FR-AUTH-02, 04, 06, 07; FR-PROF-03, 04, 05; FR-VER-01, 04, 05; FR-CONS-02; FR-DISC-01 to 03, 06 | Google sign-in, MFA for privileged roles, session list and revoke, institutional-email affiliation, mentor activation gate, profile visibility, badge disclaimer, revocable institution-sharing consent, pure match function with tests, discovery list | A mentor is activated after affiliation and MFA; a student sees suggested mentors with reasons |
| **3** | Requests and notifications | FR-REQ-01, 02, 03 (accept/decline), 05 to 08; FR-NOT-01 | Request creation with idempotency, capacity row lock, accept/decline/withdraw, 48h expiry and 24h reminder sweeper, email templates and de-duplication | Student sends a request, mentor accepts or declines; an ignored request gets one reminder and expires |
| **4** | Mentorship, thread, session | FR-MEN-01, 02; FR-THR-01, 02; FR-SES-01, 02 | Mentorship on acceptance, agreement, text thread, notification on new message, meeting link, session record and held confirmations | Student and mentor exchange messages, record a session with a link, both confirm it was held |
| **5** | Outcomes | FR-OUT-01 to 07, 09, 11 | Outcome state machine, append-only events and verification records, evidence upload and scan, evidence tier, withdraw, conflict declaration, reminders day 3/5 and day-7 escalation | Student reports an outcome, mentor confirms or disputes, a withdrawn outcome never counts |
| **6** | Reputation and impact | FR-OUT-10; FR-REP-01 to 05, 07 | Reputation ledger, pair factor `1/(1+n)`, cooling and counting sweeper, snapshots, confidence tiers, clawback, counts-only public view | Mentor impact view shows counted outcomes; replaying the ledger reproduces it |
| **7** | Admin, privacy, hardening | FR-ADM-01, 03 to 07; FR-VER-02 (attestation queue); FR-PRIV-01, 02; FR-AUD-01; FR-UX-01, 02, 04, 05; FR-NOT-03, 04 | Platform review queue with written reason, institution attestation queue, audit sampling, moderation, sanctions, break-glass, versioned config, export and download, deletion intake and ledger-safe pseudonymization, audit log, accessibility pass, rate limits, restore drill, runbook, Terms and Privacy Notice drafts | A platform admin resolves a case with a written reason; an institution admin attests an affiliation; export and deletion can be requested and tracked; restore performed |

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
| 2 | Can a mentor decide on a request, and does an undecided request expire at 48 hours? |
| 3 | Does a student receive an email when the mentor decides, and does the thread stay participant-only? |
| 4 | Does the state machine reject every illegal outcome transition in tests? |
| 5 | Does replaying the reputation ledger reproduce the snapshot exactly? |
| 6 | Can a platform admin resolve a case with a written reason while an institution admin cannot? |
| 7 | Was a backup restored successfully and did the full lifecycle pass on a clean machine? |

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
