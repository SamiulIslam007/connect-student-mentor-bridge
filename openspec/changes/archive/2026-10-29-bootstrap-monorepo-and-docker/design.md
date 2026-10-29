# Design

## Context

The repository is documentation only; there is no application code, no git history, no workspace, and no CI. The approved constraints that shape this change:

- One repository, pnpm workspaces, one lockfile; Turborepo is explicitly deferred (ADR-014, O-3).
- Docker for every deployable and every dependency (ADR-016): multi-stage images, pinned base images, non-root, no baked secrets, health check on every service, build once and promote.
- One API image serves both API and worker by changing the start command (ADR-016).
- `/healthz` and `/readyz` are unversioned, unauthenticated, and used by Docker and uptime monitoring (`docs/api-contracts.md`, SEC-INF-8, NFR-OBS-03).
- No Prisma schema, pg-boss, outbox, email adapter, or product feature in this change (see `proposal.md`).

## Goals / Non-Goals

**Goals:**

- A contributor on Windows, macOS, or Linux installs, builds, checks, and tests the whole workspace with root commands.
- `docker compose up` from a clean checkout reaches a healthy stack: web, api, worker, Postgres, MinIO, Mailpit, ClamAV.
- The API exposes operational endpoints that the container health check and monitoring can rely on, and that survive a database outage in the liveness case.
- CI enforces the Definition of Done gates on every pull request.

**Non-Goals:**

- No database schema, migrations, ORM models, queues, mail sending, or upload path.
- No PWA manifest, service worker, offline support, or UI beyond a shell page.
- No deployment, staging, hosting decision, TLS, or managed service.
- No application-level module boundaries beyond the workspace package boundaries.

## Decisions

### D1. pnpm workspaces without a task runner

`pnpm-workspace.yaml` lists `apps/*`, `services/*`, `packages/*`. Root scripts use `pnpm -r` with explicit ordering where needed (`packages/*` before apps). No Turborepo, Nx, or Lerna.

- **Why:** one lockfile, native workspace protocol, and the deferral of Turborepo is already decided (O-3). A task runner buys caching we do not need at three packages and one app.
- **Alternative rejected:** npm or Yarn workspaces (weaker workspace filtering and phantom-dependency behavior); Turborepo now (premature, adds config surface).

### D2. Repository layout

```
connect/
  apps/web/                 Next.js App Router app (TypeScript)
  services/api/             NestJS app: src/main.ts (API), src/worker.ts (worker)
  packages/domain/          pure TypeScript, no framework imports
  packages/contracts/       openapi.yaml placeholder, shared schemas
  packages/config/          shared constants and labels
  infra/docker/             Dockerfile.api, Dockerfile.web, entrypoints
  compose.yaml              base local stack (see D3)
  compose.dev.yaml          hot-reload overlay
  .github/workflows/ci.yml
```

Workspace packages export TypeScript source directly and are compiled by their consumers' builds; the API and web builds are the only bundlers. This avoids a per-package build step and stale `dist` folders while `packages/domain` stays pure.

- **Why:** matches the approved layout (ADR-014) and keeps one place for build artifacts.
- **Alternative rejected:** per-package `tsc` build and `dist` entrypoints (more config, slower loops, no benefit until a package is published).

### D3. Compose files at repository root, Dockerfiles under `infra/`

`compose.yaml` and `compose.dev.yaml` live at the repository root so plain `docker compose up` works with default discovery, correct relative build contexts, and root-level `.env` interpolation. Docker build files stay in `infra/docker/`.

- **Why:** the approved docs require `docker compose up` to be the one command. Compose resolves relative paths and the project directory from the compose file location; nesting the file under `infra/compose/` would need `--file` and `--project-directory` flags on every invocation and a different path for `env_file`.
- **Deviation recorded:** this refines ADR-014's `infra/docker/` sketch; ADR text is a layout sketch, not a requirement. If the owner prefers strict ADR conformance, the same files move with a root `pnpm stack:*` wrapper and no behavioral change.
- **Alternative rejected:** root `package.json` script that wraps `docker compose -f infra/compose/compose.yaml --env-file .env up` (works, but every manual command and every doc must repeat the flags).

### D4. Base compose plus a development overlay

`compose.yaml` is the runnable stack: built images, no source mounts, restart unless-stopped, named volumes for Postgres, MinIO, and Mailpit data. `compose.dev.yaml` adds bind mounts and file-watching commands for `web`, `api`, and `worker`.

- **Why:** keeps the base definition deployable (ADR-016 parity) while preserving fast local loops.
- **Alternative rejected:** one file with profiles (harder to reason about, easy to ship a dev-only mount).

### D5. Health endpoints: plain controller plus a direct `pg` readiness probe

The API implements two controllers without a health framework:

- `GET /healthz` returns `200 {"status":"ok","service":"api"}` and touches nothing.
- `GET /readyz` returns `200 {"status":"ok","checks":{"database":"ok"}}` when `SELECT 1` succeeds, otherwise `503 {"status":"unavailable","checks":{"database":"unavailable"}}`, with a 2-second probe timeout (Proposed default). The internal error is logged with the request ID, never returned.

The readiness probe uses the `pg` driver directly with `DATABASE_URL`; Prisma is not introduced by this change. The probe is one small module so the later Prisma-based check replaces only that module.

- **Why:** `@nestjs/terminus` is a dependency and abstraction for two endpoints; a bare TCP check would report ready before the database is usable. `pg` is the driver Prisma will use anyway, so the dependency is not throwaway.
- **Alternative rejected:** Terminus now (extra abstraction, no indicators that matter yet); TCP-only probe (false ready during startup and auth failure).

### D6. Diagnostics route for the web container; no API call from web health

The web container health check requests a static route that returns `200` without server-side data (the shell page). It does not proxy `/healthz`, because readiness of the web tier must not depend on the API or database.

- **Why:** web availability and API readiness are separate concerns; coupling them makes a database blip mark the whole stack unhealthy.
- **Alternative rejected:** web health that calls the API (cascading unhealthy states, slower probes).

### D7. Node and framework versions pinned in one place

Node major version is pinned in `.nvmrc`, `package.json` `engines`, and both Dockerfiles from the same value. Next.js, NestJS, React, and TypeScript versions are pinned by the lockfile, with Docker base images using explicit tags (not `latest`).

- **Proposed default:** Node 24 LTS, current stable Next.js and NestJS majors at implementation time, `postgres:16-alpine`, current MinIO, Mailpit, and ClamAV image tags. The exact tags are recorded in the change's tasks when implemented; no floating tag is allowed.
- **Alternative rejected:** unpinned `latest` tags (non-reproducible builds, ADR-016 violation).

### D8. CI as one workflow with three parallel jobs

`.github/workflows/ci.yml`, triggered on `pull_request` and on push to the default branch, with `concurrency` cancel-in-progress:

1. **checks** — pnpm install with frozen lockfile (store cached), lint, type-check, unit tests, build.
2. **images** — Docker Buildx build of `api` and `web`, then a Trivy scan of each image with `ignore-unfixed`, failing on `HIGH`/`CRITICAL` (Proposed default).
3. **security** — dependency audit at high severity and a Gitleaks secret scan of the diff.

Branch protection (required checks, no direct pushes) is a GitHub repository setting configured by the owner once; it cannot be expressed in workflow YAML. The workflow is the enforcement point that protection references.

- **Why:** separate jobs run in parallel and make the failing concern obvious; a single job would serialize a multi-minute image build behind unit tests.
- **Alternative rejected:** a matrix over packages (slow fan-out for three small packages); adding SAST/CodeQL now (not required by any approved document, more CI time than value at this size).

### D9. Environment contract

All variables come from the environment. `.env.example` groups them: database (`DATABASE_URL`, Postgres bootstrap variables), object storage (`S3_*`), mail (`SMTP_*`), scanner (`CLAMAV_HOST`, `CLAMAV_PORT`), web (`NEXT_PUBLIC_*`), and process (`NODE_ENV`, `PORT`, `LOG_LEVEL`). Compose reads `.env` at the repository root; no value in `.env.example` is real or usable against a deployed system.

- **Why:** one documented place for every variable, matching ADR-016's twelve-factor rule.
- **Alternative rejected:** per-service env examples (drift, duplicated values).

### D10. Minimal tests for this change

One unit test for the readiness logic (database reachable → ok, unreachable → unavailable, timeout honored) and one HTTP-level test asserting `/healthz` returns 200 and `/readyz` returns 503 when the probe fails. No broader test scaffolding is added now; the testing pyramid grows with each feature change.

- **Why:** the health endpoints are the only non-trivial behavior in this change; everything else is verified by the commands themselves.

## Risks / Trade-offs

- **Docker on Windows adds volume and bind-mount overhead** → source mounts are confined to the dev overlay; base stack uses named volumes; document the WSL2 requirement in `README`/`AGENTS`-adjacent setup notes.
- **ClamAV is heavy and slow to start** (large signature download on first run) → separate long `start_period` in its health check, no dependency on it from `api` yet, and document the first-run delay. Revisit with a managed scanner only if it blocks development.
- **MinIO and Mailpit images are third-party and change tags** → pin exact tags; dependabot-style review is out of scope, so the update is a deliberate change. **Implemented deviation:** the MinIO community image no longer allows anonymous pulls, so a clean checkout and CI could not start it. The local stack runs `versity/versitygw` (S3-compatible gateway, pinned tag) behind the same `S3_*` contract; recorded in `docs/local-setup.md`. Revisit if registry credentials for a MinIO image become available.
- **Readiness probe flaps during a future migration** → readiness is dependency-based by design; the API is expected to be removed from rotation during migrations once a deployment exists. Logged as a future runbook item.
- **Image scans can block on unfixed base-image findings** → `ignore-unfixed` plus severity threshold; a real finding is a fix, not an ignore entry.
- **Branch protection is a manual owner step** → recorded as an explicit task and called out as the only requirement that cannot be verified by the local stack or CI log alone.
- **Compose location deviates from the ADR-014 sketch** → recorded in D3 with the exact alternative if the owner wants strict conformance.
- **Workspace packages export TypeScript source** → consumers must compile them; acceptable while every consumer is type-checked in CI. If a package needs to be consumed by an untyped tool later, add a build step then.

## Migration Plan

Greenfield: `git init`, create the workspace and stack on a feature branch (`feat/bootstrap-monorepo-and-docker`), verify locally, push the branch and open a pull request. Rollback is deleting the branch; there is no deployed system, data, or user to migrate. The owner merges and configures branch protection.

## Open Questions

- Exact PostgreSQL major version to pin, keeping the local version equal to the managed instance chosen after the MVP. Local `16-alpine` is a Proposed default; the hosting decision remains deferred per the approved docs.
- Whether the web shell ships the PWA manifest in this change or in a later Sprint 0 item. It is not required by any Gate 1 criterion and is not needed for the stack to be healthy.
- Whether the first ClamAV run should be documented as an optional profile if its cold start proves disruptive on a laptop. This does not change any capability contract, only the default Compose invocation.
