# Design: first-deployment-restore-drill-and-observability

## Context

See `proposal.md` — Why. Constraints that shape the approach:

- `infra/docker/Dockerfile.web` and `infra/docker/Dockerfile.api` already build the two runtime images; `docs/production-requirements.md` §4.1 states that the worker is the API image with a different command. Nothing in the repository assumes a provider.
- `docs/runbook.md` §1 to §4 already order bring-up, migrate, the object store and the retention switch; §5 to §7 hold the three record tables this change fills (§5 incident and support, §6 the first `PLATFORM_ADMIN`, §7 backup and restore).
- `services/api/src/health/health.controller.ts:50` serves `@SkipThrottle` `GET /healthz`; `:55` serves `/readyz`, which reports the database. The web app has its own `/healthz` (`apps/web/app/healthz/route.ts`).
- `services/api/package.json:14` — `db:migrate` is `drizzle-kit migrate`; `docs/runbook.md` §2 already runs it as its own step.
- `grep -rni sentry` over the repository finds only documentation; `services/api/src` makes no outbound HTTP call at all.
- `.env.example` lists every variable by name with no values; it is the only place a new variable is declared (`AGENTS.md` rule 4).
- `SEC-INF-6` and `SEC-INF-7` (`docs/security-requirements.md:181-182`) fix the deploy source and the restore obligation; `D-226` and `D-227` fix that the bootstrap and the restore record are hand-filled tables, not scripts.
- `docs/assumptions-and-open-questions.md` N5 and README §18 #14 leave the host open; `docs/production-requirements.md` §5 already prescribes the one-day test that chooses it.

## Goals / Non-Goals

**Goals**

- A pilot partner's first user can load the app, receive an email, and have their data backed up and restorable.
- A failure is visible to the owner before a student reports it.
- The three one-time procedures have a written record with a date and an operator.

**Non-Goals**

- No second environment, no promotion pipeline, no IaC.
- No paid tier anywhere; each external dependency has a free tier and a documented fallback.
- No change to the retention default, the queue set or the evidence policy.

## Decisions

### D-250: One host, chosen by the documented one-day test, with Render as the first candidate and Singapore as the first region

- Date: 2026-11-21
- Decision: the deployment target is chosen by running `docs/production-requirements.md` §5's one-day test (deploy both images, measure response time from a Bangladesh mobile connection, confirm managed Postgres with PITR, confirm a private bucket, compare cost, read support) and recorded as a new ADR. **Render is the first candidate** — managed Postgres with point-in-time recovery, container deploys from the existing Dockerfiles, a worker service and a Singapore region — and a host that cannot run the worker as a second process from the same image fails the test. The provider's answer is recorded as an **Open Question** in this change rather than assumed: the owner's README §18 #14 decision is still open, and the ADR is what closes it.
- Reason: the choice is the owner's, but the criteria are already written down, and leaving the criteria implicit is how a one-day decision becomes a two-week one. Render fits the shape the repository already has with the fewest new concepts: no Kubernetes, no IaC, PITR on the managed database.
- What would change this decision: measured latency from Bangladesh being unacceptable in Singapore, or a host failing the PITR or private-bucket check — either sends the decision to the next candidate in the same test, not to a redesign.
- Status: Decided (owner-approved as the audit's H1 recommendation, with the final choice recorded in an ADR)
- Affects: `docs/architecture-decisions.md`, `docs/production-requirements.md` §5, `README.md` §14 and §18, `docs/runbook.md` §5

### D-251: Sentry's free tier for all three processes, with a scrub list and an inert default

- Date: 2026-11-21
- Decision: `@sentry/node` in the API and the worker, `@sentry/nextjs` in the web app, initialised only when `SENTRY_DSN` is non-empty. `services/api/src/platform/observability.ts` exports one `beforeSend` that drops `authorization`, `cookie` and every header except a small allow-list, request and response bodies, and any field named like an email body or an evidence object. Traces are off (`SENTRY_TRACES_SAMPLE_RATE=0`) until a measured need appears.
- Reason: `docs/production-requirements.md` §9 names error tracking as the pilot minimum, the free tier covers a 130-user pilot, and one SDK per runtime keeps the failure mode simple. Traces are off because OpenTelemetry is explicitly Later in `README.md` §14.
- What would change this decision: an unacceptable third-party processor during the privacy review, in which case the fallback is logs-only plus a log-based alert, and the capability's error-reporting scenario is amended rather than the record faked.
- Alternatives rejected: (a) self-hosted GlitchTip — no vendor, ops time the owner does not have; (b) logs only — no stack traces, and the first incident is investigated blind.
- Status: Decided (owner-approved as the audit's H2 recommendation)
- Affects: `services/api/src/main.ts`, `services/api/src/worker.ts`, `apps/web` instrumentation hook, `.env.example`

### D-252: `pg_dump`/`pg_restore` into a scratch database first, PITR second

- Date: 2026-11-21
- Decision: the drill performs a `pg_dump` of the deployed database, restores it into a scratch database with `pg_restore`, and verifies with row counts for three tables (users, outcomes, audit_logs) plus one authenticated read through the API against the restored data. Once the provider's PITR is confirmed, a second drill restores to a point in time. Both are recorded in `docs/runbook.md` §7 with date, duration, result and operator.
- Reason: a dump-and-restore proves the backup exists, is readable and contains the rows; PITR proves the provider's mechanism. The first is under the owner's control and repeatable on any host; the second depends on the chosen provider's console.
- What would change this decision: the provider offering no point-in-time recovery, which fails `SEC-INF-7` and disqualifies it in D-250's test rather than being accepted.
- Status: Decided (owner-approved as the audit's H3 recommendation)
- Affects: `docs/runbook.md` §7, `docs/production-requirements.md` §10

## Deploy order

1. `pnpm --filter api db:migrate` against the deployed database — a separate step, its own log, and the release stops if it fails.
2. New API container starts; `/readyz` must report `database: ok`.
3. New worker starts; the log line that names its queues appears.
4. New web container starts; `/healthz` answers `200`.
5. One browser pass: sign-in page renders, one sign-up sends a real email through the provider.

## Risks / Trade-offs

- Two external services (error tracking, uptime) added to a product with none → both inert without configuration, both free-tier, both with a documented fallback, and neither on a request path a user waits for.
- The error tracker sees a request's shape even with bodies dropped → the scrub list is tested, the deployed project is read by hand on the first day, and the privacy notice gains one line naming the processor (a docs task, not a code one).
- A restore drill on a large database takes time → at pilot volume it is minutes; the record captures the duration so growth is visible.
- The bootstrap `INSERT` remains a hand operation → `D-226` keeps it that way, and the record table is the compensation; a second operator check is out of scope for a one-person team and named in `DEBT-46`.

## Open Questions

1. **Which host and region?** The owner's README §18 #14 decision is open. Safe default used here: Render, Singapore, pending the one-day test in D-250; the ADR records whatever the test says. Nothing in this change's task order depends on which host wins.
2. **Is a second environment required at Gate 1?** `docs/production-requirements.md` §5:94 says no and §13.1 implies yes; change 3 records the conflict and leaves §13.1 unticked with a pointer. Safe default: one environment, and the staging question stays open rather than answering it by deploying twice.
