---
title: Architecture Decisions (ADR Log)
status: Draft
owner: Owner
date: 2026-10-28
sources: README.md (sections 7, 8, 9, 14); connect-research-report.md (Sections 5, 6, Doc 11); Owner decisions of 15 to 28 October 2026
---

# Architecture Decisions (ADR Log)

> **Role of this document.** One place where every significant technical decision is recorded with its context, alternatives, reasons, and the trigger that would make us revisit it. If this file and the README disagree, resolve the conflict explicitly and update both (README section 1).

## 1. How to use this log

### 1.1 Truth labels (from README section 1.1)

| Label | Meaning in this document |
|---|---|
| **Owner decision** | Stated directly by the owner. Still needs formal approval here. |
| **Recommendation** | Reasoned proposal. Not policy until the owner approves. |
| **Proposed default** | Editable starting value, not validated. |
| **Open decision** | Not decided. Must not be treated as policy. |
| **Verified [S#]** | Confirmed in a source listed in the research report, Section 12. |

### 1.2 Status lifecycle

`Proposed` -> `Approved` -> (`Superseded by ADR-xxx` or `Deprecated`)

- Only the owner sets a status to **Approved** (AGENTS.md rule).
- An Approved ADR is never edited to change its meaning. Write a **new ADR** that supersedes it and link both ways.
- Every status change adds one line to `docs/decision-log.md`.

### 1.3 ADR template (10 fields)

```
### ADR-NNN: <short decision title>
- Context:
- Options:
- Decision:
- Reasons:
- Consequences:
- Reversibility: Hard | Moderate | Easy
- Revisit trigger:
- Status: Proposed | Approved | Superseded
- Date / Owner:
```

### 1.4 Methodology note (Agile)

The project follows an **Agile** software development life cycle (ADR-017). ADRs are therefore **living**: a decision is made at the last responsible moment, recorded briefly, and revisited when its trigger fires. This log is not a big-design-up-front contract.

---

## 2. ADR index

| ADR | Decision | Reversibility | Source of the decision |
|---|---|---|---|
| 001 | Modular monolith inside a monorepo (NestJS). Microservices later | Moderate | **Owner decision** (28 Oct 2026) |
| 002 | PostgreSQL as the only system of record, with one ORM (Prisma default) | Hard | Recommendation |
| 003 | Embedded auth library behind an `IdentityService` interface | Easy if the seam is honored | Recommendation |
| 004 | Containerized PaaS now, AWS later (serverless only when triggered) | Easy if Dockerized | **Owner decision** (hosting path) |
| 005 | Installable web app (PWA) first, Flutter later | Easy | Recommendation (accepted 16 Oct) |
| 006 | No Redis and no WebSocket in Phase 1 | Easy | Recommendation |
| 007 | Mentor-provided meeting links in Phase 1 | Easy | Recommendation |
| 008 | Append-only ledger for outcomes, verification, and reputation | Hard | Recommendation |
| 009 | AI boundary: assist, never decide | Policy-level | Recommendation |
| 010 | No government ID collection | Moderate | Recommendation |
| 011 | Contract-first REST with OpenAPI. GraphQL later | Moderate | Recommendation; GraphQL later is **Owner decision** |
| 012 | Pure domain package for business rules | Moderate | Recommendation |
| 013 | English-only product and docs; UI strings still externalized | Costly later if skipped | **Owner decision** (English only) + Recommendation |
| 014 | Monorepo layout and tooling (pnpm workspaces) | Easy | Recommendation |
| 015 | `PaymentProvider` interface, SSLCommerz and Stripe adapters, built in Phase 3 | Moderate | **Owner decision** (both gateways) |
| 016 | Docker for everything: local, staging, and production run the same images | Easy | **Owner decision** (28 Oct 2026) |
| 017 | Agile delivery with time-boxed iterations and an explicit Definition of Done | Easy | **Owner decision** (28 Oct 2026) |

**Status as of 2026-10-29:** ADR-002 (Prisma), ADR-003 (better-auth), ADR-006 (no Redis/WebSocket, pg-boss), ADR-016 (Docker), and ADR-017 (Agile) are **Approved** by owner decision. All others remain **Proposed** until their trigger or approval.

---

## 3. Reversibility map

| Class | Decisions | Why |
|---|---|---|
| **Hard** (changing later is expensive or risky) | Database choice and schema conventions (002); ledger design (008); auth subject identifiers (the stable user ID that tokens carry, 003); what personal data we collect (010) | Data migrations, audit history, and legal exposure follow us forever. Decide carefully and early. |
| **Moderate** (a planned project to change) | Backend framework and module boundaries (001); API style (011); where business rules live (012); payment abstraction (015) | Changing needs coordinated code changes but no data loss. |
| **Easy** (a configuration or adapter change) | Hosting provider (004); email vendor; meeting provider (007); client type PWA vs native (005); Redis and WebSocket (006); repo tooling (014); sprint length (017) | Isolated behind an interface, a container, or a process choice. |

**Rule:** spend design effort in proportion to how hard the decision is to reverse.

---

## 4. Decisions

### ADR-001: Modular monolith inside a monorepo (NestJS)

- **Context:** One engineer working with AI agents. Pilot load is tiny (1 institution, 30 mentors, 100 students: **Plan target**). The owner wants to start simple and grow toward microservices, GraphQL, serverless, and AWS only when needed.
- **Options:** (a) Microservices from day one. (b) Next.js-only full stack with no separate API. (c) **Modular monolith** (one deployable API plus a worker from the same codebase) living in a **monorepo** with the web app and shared packages.
- **Decision:** Option (c). The backend is a single NestJS application divided into **strictly bounded modules**: `identity`, `profiles`, `matching`, `requests`, `mentorships`, `outcomes`, `reputation`, `notifications`, `institutions`, `admin`, `audit`, `ai` (and `billing` later). The repository is a monorepo (ADR-014).
- **Reasons:** Fewest moving parts for one operator. One deploy, one database transaction boundary for the ledger (ADR-008), easy local debugging, and one place for agents to work. Clean module boundaries keep the later split cheap.
- **Module boundary rules (microservice-ready seams):**
  1. A module owns its tables. No other module reads or writes them directly.
  2. Other modules call a module only through its **public service interface** (one exported surface per module). No imports of internals.
  3. Side effects across modules go through **domain events and the outbox table** (for example `OutcomeConfirmed`, `RequestAccepted`), never through hidden calls.
  4. Business rules live in `packages/domain` (ADR-012), not in controllers or modules.
  5. The rules are enforced in CI with a dependency-boundary lint check, so violations fail the build.
- **Consequences:** One failure domain (a bug can take down the whole API). Mitigated by tests, health checks, and fast rollback (ADR-016). Scaling is vertical first, then more replicas of the same image.
- **Reversibility:** Moderate. If the boundary rules are honored, extracting a module into its own service is a bounded project.
- **Revisit trigger (any one, measured):** a single module needs independent scaling; a module needs a different runtime (for example a Python AI service); deployment of one module repeatedly blocks others; the team grows beyond what one codebase supports.
- **Status:** Proposed (Owner-stated direction). **Date / Owner:** 2026-10-28 / Owner.

### ADR-002: PostgreSQL with one ORM

- **Context:** The product's value is an auditable record of outcomes and reputation (README 10.1).
- **Options:** PostgreSQL with Prisma; PostgreSQL with Drizzle; a document database.
- **Decision:** PostgreSQL (managed, point-in-time recovery on) is the single system of record. **Prisma is the ORM and migration tool** (decided by the owner on 2026-10-29; open decision O-1 is closed). Only the NestJS application owns migrations.
- **Reasons:** Relational integrity suits the ledger and multi-tenant data. Mature migrations and strong agent familiarity with Prisma. Supports vector search later if ever needed.
- **Consequences:** Schema changes go through reviewed migrations only. Business-critical constraints (unique keys, foreign keys, check constraints) live in the database, not only in code.
- **Reversibility:** Hard (data).
- **Revisit trigger:** A measured query or migration limitation Prisma cannot meet; read replicas or partitioning needed.
- **Status:** **Approved (owner decision, 2026-10-29)**. **Date / Owner:** 2026-10-28 / Owner.

### ADR-003: Embedded auth library (`better-auth`) behind `IdentityService`

- **Context:** README proposed Keycloak. Running a Java identity provider is heavy for one engineer **(Recommendation, research report 3.2 #9)**.
- **Options:** Keycloak; Auth0; Clerk; WorkOS (SSO only); embedded TypeScript auth library; hand-built auth.
- **Decision:** Use **`better-auth`, embedded in the NestJS API**, behind an internal `IdentityService` interface. Issue standard OIDC-style tokens so a later move to Keycloak, Auth0, or WorkOS is a configuration change. **Keycloak or WorkOS only if SAML is ever needed.** MVP sign-in: Google plus email and password, with email verification and forgot-password. Facebook and LinkedIn are **Later**; Microsoft is not supported.
- **Reasons:** No extra service to run, and the smallest moving part for one builder. Google plus institutional email checks cover the pilot's affiliation needs. Details in `docs/auth-and-access-control.md`.
- **Consequences:** We own session and cookie configuration, so security tests for auth are mandatory (see `docs/security-requirements.md`).
- **Reversibility:** Easy if the seam is honored. The **user ID format (UUID `sub`)** must stay stable across providers.
- **Revisit trigger:** The first university that requires SAML or SCIM; library security or maintenance concerns.
- **Status:** **Approved (owner decision, 2026-10-29)**. **Date / Owner:** 2026-10-28 / Owner.

### ADR-004: Containerized PaaS now, AWS later

- **Context:** Owner plan: start on Heroku or a similar PaaS, move to AWS when scaling. Heroku entered sustaining engineering in February 2026 **[S5, vendor-written source]**, so it is a weak base for a company planning growth.
- **Options:** Heroku; a containerized PaaS with a Singapore or Mumbai region (Render, Fly.io, Railway); AWS from day one.
- **Decision:** Run the **same Docker images** on a container host. The provider (**Heroku, Render, or Azure**, and the region) is **undecided**; it is chosen **after the MVP is ready** by the one-day test and does not block Gate 0. Keep the AWS path open (ECS Fargate or App Runner, RDS PostgreSQL, S3 and CloudFront, SES, Secrets Manager). No Terraform or CDK until the AWS move.
- **Serverless:** Not now. Consider serverless (for example scheduled functions or event handlers) only for a specific measured workload after the AWS move.
- **Reasons:** Dockerization (ADR-016) makes the host a swappable detail, so the decision can wait.
- **Consequences:** Avoid host-specific add-ons so the move stays cheap.
- **Reversibility:** Easy if Dockerized.
- **Revisit trigger (Proposed default):** the MVP is ready and the one-day test has run; or an institution's security questionnaire requires a named cloud; or compliance needs (including data residency, **Unverified**) appear.
- **Status:** **Approved as a path (owner decision, 2026-10-29); provider still Open**. **Date / Owner:** 2026-10-28 / Owner.

### ADR-005: PWA first, Flutter later

- **Context:** About 89% of Bangladesh's internet subscriptions are mobile **[S18]**. A second client doubles testing and release work for one engineer.
- **Options:** Flutter in Phase 1 (README); installable Next.js PWA first.
- **Decision:** Phase 1 ships a **mobile-first, installable PWA** (Next.js, TypeScript, Tailwind) with student, mentor, institution, and admin route groups. Flutter moves to Phase 2 or later. The owner accepted this change on 16 October 2026.
- **Consequences:** Email is the primary notification channel. Forms autosave and retry safely.
- **Reversibility:** Easy. The OpenAPI contract (ADR-011) lets a Flutter client be generated later.
- **Revisit trigger:** Push reliability, store presence, or an institution request that the PWA cannot meet.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-006: No Redis and no WebSocket in Phase 1

- **Context:** Mentorship is asynchronous by design (README 5.1). Pilot scale is small.
- **Decision:** Use **Postgres-backed background jobs and the outbox table**, with **`pg-boss`** as the job runner (decided 2026-10-29; **provisional** - revisit only if it blocks a requirement). Delivery of updates uses email and normal page refresh/polling. No WebSocket, no Redis, and no real-time layer in the MVP.
- **Reasons:** A second data system and a WebSocket layer add operations cost with no pilot benefit.
- **Consequences:** Reminders (day 3, 5, 7) and notifications run as idempotent jobs.
- **Reversibility:** Easy. Add Redis and a Socket.IO gateway behind the same notification interface.
- **Revisit trigger:** Multi-instance real-time delivery, a measured cache need, or demand for presence and typing.
- **Status:** **Approved (owner decision, 2026-10-29)**. **Date / Owner:** 2026-10-28 / Owner.

### ADR-007: Mentor-provided meeting links

- **Context:** Zoom licensing and account model is an open README decision (#9).
- **Decision:** In Phase 1 the mentor pastes any meeting link (Meet, Zoom, and so on). connect records the link, time, and "session held" confirmations from both sides. No video SDK, recording, or transcription.
- **Reversibility:** Easy. A `VideoProvider` interface (`createMeeting`, `cancelMeeting`, `getJoinInfo`) is introduced when integration begins.
- **Revisit trigger:** A need for auto-created meetings or attendance signals, after licensing is verified. In-house calls (LiveKit direction) stay Phase 4.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-008: Append-only ledger for outcomes, verification, and reputation

- **Context:** Trust is the product. Reputation must be reproducible and auditable (README 10.1, research report 5.1).
- **Options:** Mutable score columns; append-only event tables with derived snapshots.
- **Decision:** `OutcomeEvent`, `VerificationRecord`, `ReputationEvent`, `ConsentRecord`, and `AuditLog` are **append-only**. Corrections are compensating entries (for example clawback). Scores in snapshot tables are **derived** and rebuildable from the ledger by pure functions.
- **Consequences:** Deletion and erasure requests must be reconciled with the ledger by pseudonymization (needs counsel; see `docs/data-privacy-and-retention.md`). Database permissions block UPDATE and DELETE on ledger tables for the application role.
- **Reversibility:** Hard.
- **Revisit trigger:** None planned. Any change requires a new ADR and Owner approval.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-009: AI boundary: assist, never decide (**Later**)

- **Decision:** No AI feature or model ships in the MVP or the pilot build (**Deferred, owner decision 2026-10-29**). If AI is added later: AI may draft, summarize, and flag. AI **never** confirms an outcome, sets reputation, resolves a dispute, or takes a privileged action. Human review is mandatory for anything affecting reputation, verification, or access. All AI output is labelled and logged. User text is untrusted input (prompt injection). The model provider sits behind an interface with cost caps.
- **Reasons:** Keeps credibility, limits regulatory exposure (education and employment uses are a high-risk category in the EU AI Act; obligations deferred to 2 December 2027 **[S14]**), and respects Bangladesh's rights over automated decisions **[S19]**.
- **Reversibility:** Policy-level. Loosening it is a Owner and counsel decision, not an engineering one.
- **Revisit trigger:** Offline evaluation on pilot data plus an approved consent and retention policy (Phase 5 gate).
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-010: No government ID collection

- **Decision:** Never collect or store NID, passport, driver's license, or tax ID. Verify mentors by institutional or employer email, institution attestation, and an optional professional profile link (levels 0 to 2).
- **Reasons:** Lowers breach impact and data-residency exposure (status **Unverified [S2][S3][S4]**).
- **Reversibility:** Moderate.
- **Revisit trigger:** A partner or law that requires stronger identity proofing, reviewed with counsel.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-011: Contract-first REST with OpenAPI (GraphQL later)

- **Context:** Owner plan: consider GraphQL later, not now.
- **Options:** REST with OpenAPI; GraphQL.
- **Decision:** REST over HTTPS under `/v1`, **OpenAPI as the source of truth**, a generated TypeScript client, explicit action endpoints for state changes, `Idempotency-Key` on retryable writes. Details in `docs/api-contracts.md`.
- **Reasons:** Simple permissions and audit per action, strong tooling, and a contract that web and a future Flutter client share.
- **Reversibility:** Moderate. A GraphQL layer can be added as a gateway over the same domain services without removing REST.
- **Revisit trigger:** Several clients (for example PWA, Flutter, employer portal) with measured over-fetching or under-fetching that REST endpoints cannot solve cheaply.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-012: Pure domain package for business rules

- **Decision:** Match score, reputation computation, state machines, and cooling-period logic live in `packages/domain` as **pure, unit-tested functions** with no framework or database imports. All weights and thresholds come from one config file, never inline.
- **Reasons:** Testable, portable to a future mobile client, and safe for agents to change under review.
- **Reversibility:** Moderate.
- **Revisit trigger:** None planned.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-013: English only, with externalized strings

- **Context:** the owner decided on 16 October 2026 that all documents and the product UI are **English only**.
- **Decision:** Ship English only. As a low-cost safeguard, UI text still goes through a string catalog (no hard-coded text, no text baked into images). This is a **Recommendation** the owner may decline.
- **Reasons:** Adding a language later is expensive if strings are scattered through components.
- **Reversibility:** Costly later if the string catalog is skipped.
- **Revisit trigger:** A partner or user research finding that requires another language.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-014: Monorepo layout and tooling

- **Decision:** One repository, trimmed from README 7.5 to match Phase 1:

```
connect/
  apps/
    web/                # Next.js PWA (student, mentor, institution, admin route groups)
  services/
    api/                # NestJS modular monolith (API + worker entrypoints)
  packages/
    domain/             # pure business rules (ADR-012)
    contracts/          # OpenAPI spec, shared schemas, generated client
    config/             # shared constants, weights, labels
  infra/
    docker/             # Dockerfiles, compose files
  docs/                 # all planning documents
  AGENTS.md
  README.md
```

- **Tooling (Recommendation):** pnpm workspaces with one lockfile. Add Turborepo (or similar) only when build times justify it (Open decision O-3). `apps/mobile` and `services/intelligence` are added only when their ADR triggers fire.
- **Reversibility:** Easy.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-015: `PaymentProvider` interface (SSLCommerz and Stripe)

- **Context:** Owner decision (15 October 2026): keep both gateways. Stripe needs a foreign merchant entity; SSLCommerz needs a Bangladesh entity **[S8, S21]**. Entity structure is an **Open decision** for counsel (N2).
- **Decision:** No payment code in Phase 1 or 2. In Phase 3, build one `PaymentProvider` interface with two adapters. Domain code never imports a gateway SDK. Hosted checkout only. Webhooks are verified, idempotent, and written through the outbox. Money state is an append-only ledger **separate** from the reputation ledger. **Payments never influence reputation or verification.**
- **Reversibility:** Moderate.
- **Revisit trigger:** Entity decision (N2) made; paid office hours approved; mentor payout route resolved.
- **Status:** Proposed. **Date / Owner:** 2026-10-28 / Owner.

### ADR-016: Docker for everything (dev and prod parity)

- **Context:** Owner decision (28 October 2026): containerize the whole project so it behaves the same on a local machine and on any host. README sections 7.2 and 14 already name Docker and Docker Compose.
- **Options:** Run services natively on the developer machine; containers for deployment only; **containers for local, staging, and production**.
- **Decision:** Every deployable and every dependency runs in a container.
  - **Images:** one image for `web`, one for `api` (the worker uses the same image with a different start command).
  - **Local stack (Docker Compose):** `web`, `api`, `worker`, `postgres`, an S3-compatible object store (for example MinIO), and a mail catcher (for example Mailpit). A compose override file adds hot reload for development.
  - **Build once, deploy many:** the image built and tested in CI is the exact image promoted to staging and then production. Behavior differs only by environment variables.
  - **Image rules:** multi-stage builds, pinned base image versions, non-root user, no secrets baked into images, a health check on every service, image vulnerability scanning in CI.
  - **Configuration:** environment variables only (twelve-factor style). A committed `.env.example` lists every variable with no real values.
  - **Database:** managed PostgreSQL in staging and production. Local Postgres runs in Compose with the same major version.
- **Reasons:** Removes "works on my machine" problems, keeps the host swappable (ADR-004), and makes AI agents and new contributors productive from one command.
- **Consequences:** Docker is a required local tool. Containers add some local resource use and a learning curve.
- **Reversibility:** Easy.
- **Revisit trigger:** Local resource limits make development slow; a managed runtime (for example serverless) needs a different packaging format.
- **Status:** **Approved (owner decision, 2026-10-29)**. **Date / Owner:** 2026-10-28 / Owner.

### ADR-017: Agile delivery

- **Context:** Owner decision (28 October 2026): use the Agile model of the software development life cycle. The README does not yet describe an Agile process, so this ADR fills the gap.
- **Decision (Recommendation for a solo builder with AI agents):**
  - **Iterations:** time-boxed sprints. **1 week** until the MVP/pilot launches, then **2 weeks** during the pilot (decided 2026-10-29; O-4 closed). Working capacity is about **3 days per week**.
  - **Board:** one Kanban-style board (Backlog, Ready, In progress, In review, Done) with a work-in-progress limit of 2 to 3 items.
  - **Backlog source:** requirement IDs from `docs/functional-requirements.md` (for example `OUT-2`), each with a Given/When/Then done test.
  - **Definition of Ready:** the item traces to a requirement and a journey step, has acceptance criteria, and its governing document is Approved.
  - **Definition of Done:** acceptance criteria pass; unit tests for domain rules; integration tests for API and database; contract tests pass; no module-boundary violations; runs in Docker Compose; deployed to staging; relevant docs updated; decision log updated if a decision changed.
  - **Increment:** every iteration ends with something demoable on staging. The first target is the **walking skeleton** (Gate 1).
  - **Ceremonies (lightweight):** a weekly planning, a weekly review/demo, and a short retrospective. During the pilot, the weekly pulse (see `docs/pilot-plan.md`) feeds the next iteration.
  - **Change control:** Approved documents can change. A change needs one entry in `docs/decision-log.md`. Documents are living; Gate 0 is a **lightweight planning gate**, not a promise that nothing changes.
  - **Branching and review:** trunk-based, short-lived feature branches, mandatory review (README 14). **Agent git permissions are decided (2026-10-29):** agents branch and commit only; they never push or merge to `main`, never force-push, and never touch secrets or `.env` files. `AGENTS.md` states this minimal safe default; N11 is closed.
- **Reasons:** Short feedback loops fit a product whose assumptions are all unvalidated (see `docs/assumptions-and-open-questions.md`).
- **Reversibility:** Easy.
- **Revisit trigger:** A second engineer joins, or iteration overhead exceeds its value.
- **Status:** **Approved (owner decision, 2026-10-29)**. **Date / Owner:** 2026-10-28 / Owner.

---

## 5. Where these decisions are enforced

| Decision | Enforced by |
|---|---|
| Module boundaries (ADR-001) | Dependency-boundary lint in CI |
| Ledger immutability (ADR-008) | Database roles without UPDATE or DELETE on ledger tables; tests |
| Pure domain rules (ADR-012) | No framework imports in `packages/domain` (lint); unit tests |
| Contract-first API (ADR-011) | OpenAPI diff and contract tests in CI |
| Docker parity (ADR-016) | CI builds the images and runs integration tests against Compose |
| No secrets in images or repo (ADR-016) | Secret scanning in CI; `.env.example` only |

## 6. Open decisions and questions for the owner

| # | Question | Status |
|---|---|---|
| O-1 | Prisma or Drizzle? | **Closed 2026-10-29: Prisma** |
| O-2 | Postgres-backed job runner library | **Closed 2026-10-29: pg-boss (provisional)** |
| O-3 | Add Turborepo now or later? | Later |
| O-4 | Iteration length? | **Closed 2026-10-29: 1 week until launch, 2 weeks in the pilot** |
| O-5 | Approve better-auth as the auth library? | **Closed 2026-10-29: yes** |
| O-6 | Which host? | **Deferred (owner decision):** after the MVP; not a Gate 0 blocker |
| O-7 | Keep the string-catalog safeguard while staying English only? | **Closed 2026-10-29: yes**, kept |
| O-8 | Pilot partner type (university, bootcamp, department)? | Open; not a Gate 0 blocker |

## 7. Acceptance checklist

- [ ] Every ADR has all ten template fields.
- [ ] Every ADR names a revisit trigger.
- [ ] The reversibility map covers every ADR.
- [ ] The system architecture diagram matches the "Now" decisions here (no ADR marked "later" is required by a Phase 1 requirement).
- [ ] No ADR relies on an **Unverified** claim without saying so.
- [ ] Owner-stated directions (001, 004, 011 GraphQL deferral, 013, 015, 016, 017) are confirmed or changed by the owner.
