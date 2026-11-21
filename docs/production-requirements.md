---
title: Production Requirements
status: Draft
owner: Owner / CTO
date: 2026-10-29
sources: [README.md sections 7, 13, 14, connect-research-report.md (Sections 5, 7 doc 15, 9.2, 10)]
---

# connect: Production Requirements

> Defines what must be true before connect can be called **launchable**. Truth labels follow README section 1.1. All numbers are **Proposed defaults** unless marked otherwise.

## 1. Purpose and scope

This document answers: "What must be true for the real product to run for real users?" It covers scope, constraints, environments, Docker, hosting, reliability, security, operations, support, release process, launch criteria, and dependencies. It complements `non-functional-requirements.md` (targets), `security-requirements.md` (controls), and `milestones-and-phases.md` (timing).

Two launch levels are used:

| Level | Meaning | Gate |
|---|---|---|
| **MVP internal launch** | Runs on production infrastructure for the owner and test users only | Gate 1 |
| **Pilot launch** | Real students and mentors from the partner institution | Gate 2 |

## 2. Production scope (Phase 1)

### 2.1 In scope

Web PWA (student, mentor, institution admin, platform admin routes), NestJS modular monolith API plus a background worker (same codebase), managed PostgreSQL, private object storage for evidence, transactional email, error tracking, uptime check. Features per `functional-requirements.md` (Must items, plus Should items if time allows).

### 2.2 Out of scope (Phase 1)

Flutter app, Redis, WebSocket real-time, FastAPI service, Zoom API integration, payments, employer portal, structured community circles, group office hours, in-house audio/video, AI features and AI models, public star ratings, SAML SSO, phone OTP, Microsoft login, minors.

### 2.3 Fixed constraints

| Constraint | Source |
|---|---|
| 18+ only | Owner decision |
| English-only UI and documents | Owner decision |
| One engineer working with AI agents | Plan |
| Docker for all runtime parts | Owner decision |
| No government IDs, no card data, no precise location stored | Research 5.7 |
| Unconfirmed outcomes never affect reputation | README principle |
| AI never decides outcomes, reputation, or access | Research 5.6 |

## 3. Environments

| Environment | Purpose | Data | Deploy |
|---|---|---|---|
| **Local** | Development | Fake seed data only | `docker compose up` |
| **Staging** | Integration, demos, end-to-end tests | Fake or anonymized data only; never copy production data | Automatic from `main` after CI passes |
| **Production** | Real users | Real data | Manual promote of a tagged image |

Rules: separate databases, buckets, secrets, and email sender per environment. No production data in staging or local. Staging email goes to a catcher or allow-list only.

## 4. Docker and runtime layout

**Principle:** the same container images run locally and in hosting. Configuration comes from environment variables, never baked into images.

### 4.1 Containers

| Service | Image source | Local | Staging / Production |
|---|---|---|---|
| `web` | Next.js app | Container | Container |
| `api` | NestJS | Container | Container |
| `worker` | Same image as `api`, different command (jobs, reminders, outbox) | Container | Container |
| `postgres` | Official Postgres | Container | **Managed Postgres** (point-in-time recovery on) |
| `objectstore` | MinIO (S3-compatible) | Container | R2 or S3 private bucket |
| `mailpit` | Mail catcher | Container | Not used (real email provider) |
| `clamav` | Malware scanner for evidence uploads | Container | Managed scanning service or a scanner sidecar (Later) |

### 4.2 Requirements

- [x] One command starts the full stack locally (`docker compose up`), from a clean checkout, with documented seed data - `compose.yaml` plus `docs/local-setup.md`; the `e2e` job boots the same API and web app from source and seeds its own database (`e2e/support/prepare.ts`).
- [ ] Images are built by CI (`images` job in `.github/workflows/ci.yml`, both Dockerfiles) and scanned; tagging with the git commit and promotion are **unmet: no registry and no host yet, owned by `first-deployment-restore-drill-and-observability`**.
- [x] Images run as non-root (`USER node` in `infra/docker/Dockerfile.api:59` and `Dockerfile.web:61`), have a health endpoint (`infra/docker/healthcheck.mjs`, `apps/web/app/healthz`), and pin their base image (`node:${NODE_VERSION}-alpine` from `.nvmrc`).
- [ ] Migrations run as a separate, explicit step before the new version starts - documented and hand-run (`docs/runbook.md`, `pnpm --filter api db:migrate`); automated invocation and the forward-compatibility guarantee are **unmet: owned by the deployment change**.
- [x] `.env` files are never committed (`.gitignore`, and Gitleaks in the `security` job scans every change); `.env.example` lists every variable without values.
- [x] Container and dependency scanning runs in CI - `trivy` on both images at HIGH/CRITICAL and `pnpm audit --audit-level high` (`images` and `security` jobs).

## 5. Hosting

| Item | Decision | Label |
|---|---|---|
| Provider | **Undecided** (Heroku, Render, or Azure). Chosen after the MVP is ready by a one-day test; **must not block Gate 0** | **Open decision**, owner |
| Host type | Containers from Docker images, on the chosen provider | **Owner decision** (ADR-016) |
| Domain | From the GitHub Student Pack | **Owner decision** |
| Heroku | A candidate, not the default. Entered sustaining engineering on 6 Feb 2026 [S5] | Verified [S5] (vendor source) |
| Cloud path | Same containers on AWS when triggers hit | Recommendation |
| Infrastructure as code | Out of scope until the AWS move | Recommendation |

**Hosting test checklist (one day, after the MVP):** deploy the same container to two candidates; measure response time from a Bangladesh mobile connection; confirm managed Postgres backup and point-in-time recovery; confirm private object storage options; compare monthly cost; read support options; record the result in an ADR.

Until a host is chosen, "staging" means the local Docker stack with seed data. Gate 1 does not require a deployed environment.

## 6. Reliability targets

From README section 13 and research doc 8. These are **targets, not an SLA** (one operator).

| Area | Target |
|---|---|
| Availability | 99.5% monthly for the core API (about 3.6 hours allowed downtime per month) |
| API latency | p95 under 500 ms for standard reads; under 1 s for writes |
| Email delivery | Notification email sent within 5 minutes of the event under normal conditions |
| Background jobs | Reminders and expiry jobs run within 15 minutes of schedule |
| Recovery point | Daily backups plus point-in-time recovery |
| Recovery time | Restore to a working service within 4 hours (**Proposed**) |
| Capacity | Sized for 1 institution, 30 mentors, 100 students with 10x headroom without redesign |
| Mobile web | Key screens usable on a throttled slow connection and a low-end Android device (test device and network profile to be defined) |
| Accessibility | WCAG 2.1 AA - automated axe run over all 23 surfaces with zero violations and a recorded keyboard walk (`e2e/accessibility.spec.ts`, `docs/audit/2026-11-21-accessibility-pass.md`); the NVDA pass is still owed (`DEBT-38`) |

**Resilience rules:** form drafts autosave and survive reconnect; retryable POST endpoints use an Idempotency-Key; email is the fallback channel; an email outage queues retries; if an AI provider is down, assist features are disabled and core flows continue.

## 7. Security requirements for launch

Detailed controls live in `security-requirements.md`. Launch-blocking minimum:

- [x] Authentication with email verification; MFA for mentors, institution admins, and platform admins - `services/api/src/authorization/authorize.ts` (`requiresMfa`), asserted by `services/api/test/authorization-matrix.test.ts`; the mentor path runs end to end in `e2e/happy-path.spec.ts`.
- [x] Role-based access plus **object-level authorization** on every endpoint - `services/api/test/authorization-matrix.test.ts` walks every registered route, and `services/api/test/mentorship.integration.test.ts` proves a third account gets `404`.
- [x] Postgres-backed cookie sessions with httpOnly, SameSite=Lax, Secure cookies on web; sign-out, sign-out-everywhere, password reset, suspension, and deactivation revoke session rows (D-31) - `apps/web/lib/session-cookie.ts` and `services/api/test/identity.integration.test.ts`. The admin idle and absolute session timeouts are **not built**: `DEBT-74` owns them (D-48).
- [x] Rate limits and brute-force protection on sign-up, sign-in, and request creation - `RATE_LIMITS` in `packages/config/src/index.ts`, the per-account throttler, and `services/api/test/rate-limits.integration.test.ts`.
- [x] Input validation on every endpoint; output encoding on web - `packages/contracts/src/body-keys.ts` behind the allowlist interceptor, `services/api/test/request-validation.integration.test.ts`, and React escaping with no raw HTML injection in `apps/web`.
- [ ] Secrets in the hosting secret store - **unmet: no host yet**, owned by `first-deployment-restore-drill-and-observability`; the repository side is enforced today (`.env` gitignored, Gitleaks in CI, `.env.example` carries names only).
- [x] Evidence files: private bucket, signed short-lived URLs, type and size limits, malware scan before availability - `services/api/src/evidence/`, `services/api/test/evidence.integration.test.ts` and `evidence-scan.test.ts`.
- [x] Audit log for verification, disputes, admin actions, and exports; entries immutable - `services/api/src/identity/audit-log.ts`, `services/api/test/audit-read.integration.test.ts` and `audit-denial.test.ts`.
- [x] Platform-admin access to threads is **break-glass**, MFA-gated and logged - `services/api/test/break-glass.integration.test.ts`.
- [x] Security headers on every API and web response, and dependency and container scanning green in CI - `services/api/test/security-headers.integration.test.ts`, `apps/web/lib/security-headers.ts` with its test, the `images` and `security` jobs. TLS everywhere is **unmet: no host yet**.
- [ ] Logs and error reports contain no tokens, message bodies, or evidence content - **unmet: no error reporter yet** (`DEBT-75`); the API's logs are structured event names only and `services/api/test/request-id-coverage.test.ts` covers the request id, not redaction.

## 8. Data protection requirements for launch

- [x] Consents C1 and C2 implemented, versioned, and append-only - `services/api/src/consents/`, `services/api/test/consent.integration.test.ts`, `CONSENT_DOCUMENT_VERSION`.
- [x] Privacy notice and terms published at `/privacy` and `/terms` from the versioned catalog - `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/test/consent.test.ts`; counsel review stays a Gate 2 condition.
- [x] Data export and deletion can be created and completed - `services/api/test/privacy.integration.test.ts`, with one `privacy_requests` row per request.
- [x] 18+ gate enforced - `packages/domain/src/age-gate.ts` with `packages/domain/test/age-gate.test.ts`, and the registration refusal in `services/api/test/registration-refusal.test.ts`.
- [ ] Retention for evidence files is implemented and **ships in dry run** until `EVIDENCE_RETENTION_DRY_RUN=false` (`services/api/test/evidence-retention-job.test.ts`, `docs/runbook.md`); log retention is **unmet: no log store yet** (`DEBT-75`).
- [ ] Processor list complete with agreements accepted - **unmet: no provider chosen**, an owner action before Gate 2.

## 9. Observability

| Need | Minimum for pilot |
|---|---|
| Errors | Sentry for web, API, and worker, with personal data scrubbed. **unmet: owned by `first-deployment-restore-drill-and-observability`** |
| Logs | Structured logs with request ID (built: one JSON line per event, `services/api/test/request-id-coverage.test.ts`); a searchable store and 90-day retention are **unmet: same change** |
| Uptime | External uptime check on `/healthz` and the login page; alert to Owner by email and phone push. **unmet: same change** |
| Metrics | Request rate, error rate, latency, job queue age, email failures. **unmet: same change** |
| Business events | Internal table for KPI events (match acceptance, response time, outcome confirmation) |
| Alerts | Error spike, uptime failure, backup failure, failed jobs older than 1 hour. **unmet: same change** |

OpenTelemetry tracing is Later (multi-service need).

## 10. Backup and recovery

- [ ] Daily automated backups and point-in-time recovery on managed Postgres - **unmet: no managed Postgres yet**, owned by the deployment change.
- [ ] Object storage versioning or replication for evidence files - **unmet: same change**.
- [ ] **A restore is actually performed** into a scratch environment before Gate 2 and repeated every quarter - **unmet: needs a real host**; the procedure and its record table exist in `docs/runbook.md` and nothing is recorded in them yet.
- [x] Recovery steps are written in the runbook (section 12) — `docs/runbook.md` §4.
- [ ] Backup failure triggers an alert - **unmet: same change**.

## 11. Release process

| Step | Rule |
|---|---|
| Branching | Trunk-based with short-lived feature branches; mandatory pull request review |
| CI gates | Lint, type-check, unit tests (pure domain rules), contract tests (OpenAPI), build, dependency scan, one end-to-end happy path in its own `e2e` job (Playwright, chromium) |
| Staging | Auto-deploy from `main`; smoke tests |
| Production | Manual promote of the tested image; announce to pilot partner for planned changes |
| Rollback | Redeploy previous image; migrations are forward-compatible; target under 30 minutes |
| Hotfix | Branch from the production tag; same CI gates |
| Release notes | One short entry per release in `CHANGELOG.md` (Planned, not yet created) |
| Feature flags | Simple config flags for AI features and any Later feature that ships dark |

Agent rule: agents may branch and commit on feature branches only. A human approves every merge, and every change touching auth, consent, ledgers, or privacy gets a human line-by-line review.

## 12. Operations: runbook and support

### 12.1 One-page runbook (must exist before Gate 2)

- [x] **Written:** `docs/runbook.md` (2026-11-20, `pilot-runbook-and-docs-truth`) — bring-up, migrate, object store, the retention dry-run switch, incident and support path, the first `PLATFORM_ADMIN` procedure with its record table, and the backup/restore drill with its record table.
- [ ] **Rehearsed at Gate 2:** the provider-specific values (host, region, bucket, TLS) and one real restore are filled in at deployment; the untested steps are marked UNVERIFIED in the runbook.

1. Deploy and rollback.
2. Rotate secrets and keys.
3. Restore from backup.
4. Handle a dispute or audit backlog.
5. Handle a user report of harassment (moderation steps and suspension path).
6. Respond to a data breach (contain, assess, notify, document).
7. Respond to a rights request (export, deletion, correction).
8. Email provider or AI provider outage.

### 12.2 Support and on-call

| Item | Proposed default |
|---|---|
| Support inbox | One shared address; first response within 1 business day |
| Severity levels | **Sev 1** service down or data exposure: respond within 1 hour; **Sev 2** core flow broken for some users: same day; **Sev 3** minor: within 3 business days |
| On-call | Owner only, business hours, **stated honestly to the pilot partner** unless coverage is added |
| Trust and safety | Owner in the MVP; a named part-time reviewer is **Deferred (owner decision)** until after the pilot |
| Dispute and audit queue | Review within 3 business days (**Proposed**) |
| Status communication | Email to pilot partner contact for outages longer than 30 minutes and for planned maintenance |

## 13. Launch criteria

### 13.1 MVP internal launch (Gate 1)

- [ ] All items in `milestones-and-phases.md` section 5.5 pass.
- [ ] Sections 4, 7 (minimum), 9, and 10 (backups on) are done.
- [ ] Staging and production deploy from the same image - **unmet: no host**; section 5 records that Gate 1 does not require a deployed environment, so this line and section 5 disagree and the owner decides it rather than this file resolving it silently.

### 13.2 Pilot launch (Gate 2, before real users)

All Gate 1 items plus **only** these, which are truly required before a real person uses the product:

- [ ] **Terms of use** published (owner draft; counsel review recommended and desirable, but its absence is a Deferred item and not a Gate 2 blocker).
- [ ] **Privacy Notice** published, matching `data-privacy-and-retention.md`.
- [ ] **Accessibility evidence**: the automated audit and the keyboard record exist (`docs/audit/2026-11-21-accessibility-pass.md`); the NVDA screen-reader pass is owed (`DEBT-38`).
- [ ] **Consent screens** live for the five MVP purposes (`TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`), append-only records tested.
- [ ] **Backup restore performed** and documented — the drill and its record table are in `docs/runbook.md` §5.
- [ ] **Runbook** (section 12.1) written — `docs/runbook.md` exists; **rehearsal at Gate 2** still open — and the **backup restore drill** in it performed once and recorded in its table.

**Deferred (owner decision), so not Gate 2 conditions:** legal entity, counsel engagement as a blocker, data-residency answer, DPIA, institution MoU signing, trust-and-safety reviewer hire, pilot partner type, willingness-to-pay work, brand clearance. These are tracked in `assumptions-and-open-questions.md` and revisited after the pilot.

**Recommended (not blocking):** institution MoU, mentor affiliation checks operating, accessibility pass, kill-criteria confirmation, owner sign-off recorded in `docs/decision-log.md`.

### 13.3 Go / no-go rule

If any "never cut" item (milestones section 5.3) or any security or data protection item is unchecked, the answer is **no-go**, regardless of schedule pressure.

## 14. Dependencies

| Dependency | Needed for | Owner | Risk if late |
|---|---|---|---|
| Approved MVP baseline documents | Gate 0 | Owner | Agents guess; rework |
| `AGENTS.md`, `docs/decision-log.md`, `docs/mvp-build-plan.md` | Gate 0 | Owner | No shared rules or plan |
| GitHub repository with CI | Sprint 0 | Owner | No safe merge gate |
| Docker Compose stack | Sprint 0 | Owner | Local development blocked |
| Email provider account and domain | Notifications (Sprint 3) | Owner | Flows incomplete |
| Hosting provider (Heroku, Render, or Azure) | After the MVP; **not** Gate 0 or Gate 1 | Owner | None before the MVP |
| Pilot partner MoU | Pilot, not Gate 2 | Owner | No real users |
| 30 mentors recruited (assumption A2) | Pilot | Owner + partner | KPIs cannot be tested |
| Counsel engagement | **Deferred (owner decision)** until after the pilot | Owner | Terms and Privacy Notice are owner drafts until then |

## 15. Cost envelope

Owner-set monthly cap is an **Open decision**. Cost components to price (no numbers invented here): hosting (web, API, worker), managed Postgres, object storage, email provider, error tracking, uptime check, domain, counsel and accountant fees (both Deferred). See `cost-model-and-infrastructure-budget.md` (**Planned, not yet created**).

## 16. Open decisions

| # | Decision | Status / needed by |
|---|---|---|
| 1 | Hosting provider and region (README #14) | **Open**, after the MVP; not a blocker |
| 2 | Identity approach ADR (README #8) | **Decided:** better-auth (ADR-003) |
| 3 | ORM choice | **Decided:** Drizzle ORM with `drizzle-kit` (ADR-018, superseding ADR-002) |
| 4 | Monthly infrastructure cost cap | Open; before production |
| 5 | Trust and safety reviewer and response targets (N7) | **Deferred (owner decision)** until after the pilot |
| 6 | Recovery time target (4 hours proposed) | Proposed default |
| 7 | Phone OTP login | **Decided:** no |
| 8 | Agent git permissions (N11) | **Decided:** minimal safe default in `AGENTS.md` |
| 9 | Modular monolith and REST for Phase 1 | **Decided:** confirmed (ADR-001, ADR-011) |
| 10 | Pilot partner type | **Open**, not a Gate 0 blocker |

## 17. Acceptance checklist for this document

- [ ] Every launch criterion is testable and has an owner.
- [ ] Gate 1 and Gate 2 lists match `milestones-and-phases.md`.
- [ ] No component outside Phase 1 scope is required for launch.
- [ ] Open decisions are recorded in `docs/decision-log.md` when resolved.

## 18. Questions for Owner

1. Do you want a hard monthly cost cap for infrastructure? What number?
2. Which hosting candidate do you want to test first after the MVP?
3. Are you comfortable stating "owner only, business hours" as the on-call model to the partner?
