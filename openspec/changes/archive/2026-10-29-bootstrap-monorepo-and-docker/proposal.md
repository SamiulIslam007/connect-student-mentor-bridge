# Proposal

## Why

Every later change must satisfy the Definition of Done in `docs/mvp-build-plan.md`: it runs from `docker compose up` on a clean machine and passes CI. No application code exists yet, so nothing can be built, demoed, or reviewed until the repository, the containerized local stack, and the CI gates exist. This is Sprint 0 setup item 1 in the approved MVP build plan (`docs/mvp-build-plan.md` section 5).

## What Changes

- Create a pnpm workspace monorepo following the layout in `docs/architecture-decisions.md` (ADR-014) and README section 7.5: `apps/web`, `services/api`, `packages/domain`, `packages/contracts`, `packages/config`, `infra/docker`.
- Add a Next.js (App Router, TypeScript) web shell and a NestJS (TypeScript) API application whose worker entrypoint uses the same image with a different start command (ADR-016).
- Expose unversioned, unauthenticated operational endpoints `GET /healthz` (liveness) and `GET /readyz` (readiness) from the API, per `docs/api-contracts.md` section 1 and SEC-INF-8.
- Add Docker Compose local stack: `web`, `api`, `worker`, `postgres`, MinIO (S3-compatible object store), Mailpit (mail catcher), ClamAV (scanner container only, no scan integration yet). Images: multi-stage, pinned base images, non-root, no baked secrets, a health check on every service.
- Add a committed `.env.example` listing every variable with no real values, and environment-variable-only configuration (ADR-016).
- Add GitHub Actions CI running install, lint, type-check, unit tests, build, Docker image build, dependency scan, image vulnerability scan, and secret scan, against a fresh checkout.
- Add root workspace scripts so the same commands work locally and in CI: install, dev, build, lint, type-check, test.
- **BREAKING**: none. No existing code, API, or data exists.

Out of scope for this change (deferred to later Sprint 0 or later changes):

- Prisma base schema, migrations, and the database connection module.
- Outbox table, pg-boss queues, and the email adapter end-to-end test event.
- ClamAV scan integration (the container is provisioned, but no upload path calls it yet).
- Any product capability (auth, profiles, matching, requests, outcomes, reputation, admin).
- Deployment, staging or production hosting, managed database, backup and restore drill.

## Capabilities

### New Capabilities

- `platform/workspace`: the single pnpm workspace where web, API, worker, and shared packages install, build, lint, type-check, and test with one set of root commands, and where shared packages stay framework-free.
- `platform/local-stack`: the Docker Compose local environment that starts the whole stack from a clean checkout with one command, with health-gated services and persistent local data.
- `platform/health-endpoints`: the `GET /healthz` and `GET /readyz` operational contract used by container health checks and uptime monitors.
- `platform/ci-pipeline`: the GitHub Actions gates that must pass before a change can be considered done.

### Modified Capabilities

None. No spec exists yet in `openspec/specs/`.

## Impact

- **New code**: `apps/web`, `services/api`, `packages/{domain,contracts,config}`, `infra/docker`, root workspace and TypeScript configuration.
- **New APIs**: `GET /healthz`, `GET /readyz` (unversioned, unauthenticated, no `/v1` prefix).
- **New dependencies**: pnpm, Node.js runtime, Next.js, NestJS, Docker and Docker Compose for contributors, GitHub Actions, a vulnerability scanner, and a secret scanner. No database client, job runner, or auth library is added by this change.
- **Configuration**: every variable is environment-provided; `.env.example` grows with each later change.
- **No data, no migrations, no production infrastructure**: the system of record and hosting remain as described in the approved docs.
- **Traces to**: `docs/mvp-build-plan.md` section 5 item 1 and Sprint 0; `docs/milestones-and-phases.md` Sprint 0; ADR-002, ADR-006, ADR-014, ADR-016; SEC-INF-8; NFR-OBS-03.
