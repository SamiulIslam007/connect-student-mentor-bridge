# Tasks

## 1. Repository and workspace baseline

- [ ] 1.1 Initialize git and create the feature branch `feat/bootstrap-monorepo-and-docker`; verify `git status` is clean and the branch is not `main`
- [ ] 1.2 Add root workspace files (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `.gitignore`, `.editorconfig`) with the `apps/*`, `services/*`, `packages/*` globs; verify `pnpm install` succeeds from a clean checkout
- [ ] 1.3 Add the shared TypeScript base config with `strict` enabled and one extending config per app, service, and package; verify `pnpm typecheck` exits 0
- [ ] 1.4 Add root scripts `dev`, `build`, `lint`, `typecheck`, `test` that fan out to every workspace member; verify each exits 0 on the empty skeleton and exits non-zero when one member is deliberately broken (then revert)
- [ ] 1.5 Add `.env.example` with every variable from design.md D9 and no real values; verify a copy of it is sufficient to start the stack later and that no secret-shaped value is present

## 2. Shared packages and boundaries

- [ ] 2.1 Create `packages/domain` with a pure TypeScript placeholder module and `packages/config` with one shared constant module; verify both typecheck and are importable from the API
- [ ] 2.2 Create `packages/contracts` with the `openapi.yaml` placeholder (operational endpoints documented as unversioned) and a shared schema module; verify the file parses as YAML and typecheck passes
- [ ] 2.3 Add ESLint boundary rules that reject framework imports in `packages/domain` and cross-imports between `apps/web`, `services/api`, and each other app or service; verify a temporary violating import fails `pnpm lint`, then revert it

## 3. Web shell and its health route

- [ ] 3.1 Scaffold the Next.js App Router app in `apps/web` with TypeScript and a minimal shell page; verify `pnpm --filter web build` succeeds
- [ ] 3.2 Add a static route that returns `200` without server-side data for the container health check; verify `pnpm --filter web start` plus a request to that route returns `200`
- [ ] 3.3 Confirm the web health route does not call the API or database (design.md D6); verify by inspection that the route has no network calls

## 4. API, worker, and operational endpoints

- [ ] 4.1 Scaffold the NestJS app in `services/api` with `main.ts` (API) and `worker.ts` (worker) entrypoints compiled from one build; verify `pnpm --filter api build` emits both entrypoints and `pnpm --filter api start` serves on the configured `PORT`
- [ ] 4.2 Implement `GET /healthz` returning `200 {"status":"ok","service":"api"}` with no authentication and no dependency calls; verify with an HTTP test
- [ ] 4.3 Implement the readiness probe module using the `pg` driver against `DATABASE_URL` with a 2-second timeout and an internal-only error log; verify unit tests cover success, failure, and timeout without leaking error detail
- [ ] 4.4 Implement `GET /readyz` returning `200` with per-dependency `ok` or `503` with `unavailable`; verify an HTTP test asserts both statuses and that no connection string or stack trace appears in the body
- [ ] 4.5 Make the worker entrypoint stay alive and log its start without opening an HTTP port; verify the process remains running and exits non-zero on an unhandled startup failure

## 5. Container images

- [ ] 5.1 Write `infra/docker/Dockerfile.api` as a multi-stage build with a pinned Node base, non-root runtime user, and the API and worker sharing the image; verify `docker build` succeeds and `docker run --rm <image> id -u` is non-zero
- [ ] 5.2 Write `infra/docker/Dockerfile.web` as a multi-stage build using the Next.js standalone output with a pinned base and non-root runtime; verify `docker build` succeeds and the container serves the shell page
- [ ] 5.3 Confirm no secret, `.env` file, or local data is copied into either image; verify by inspecting the build context ignore rules and the final image contents

## 6. Local Docker Compose stack

- [ ] 6.1 Add `compose.yaml` with `web`, `api`, `worker`, `postgres`, MinIO, Mailpit, and ClamAV, with pinned image tags, an explicit health check per service, and `depends_on` conditions so the API waits for a healthy database; verify `docker compose config` resolves and `docker compose up -d --build` reaches all-healthy
- [ ] 6.2 Add named volumes for Postgres, MinIO, and Mailpit data; verify written data survives `docker compose down` followed by `up`, and is cleared by `down -v`
- [ ] 6.3 Add `compose.dev.yaml` with source mounts and reload commands for `web`, `api`, and `worker`; verify an edit reloads the service without an image rebuild and that the base file mounts no host source
- [ ] 6.4 Wire the API container health check to `/healthz` and `/readyz` per design.md D5; verify the container reports unhealthy when the readiness probe fails (stop Postgres and observe)
- [ ] 6.5 Add a concise local setup note for the Compose command, the `.env` copy step, the Windows/WSL2 expectation, and the ClamAV first-run delay; verify the note's commands run as written on a clean checkout

## 7. CI pipeline

- [ ] 7.1 Add `.github/workflows/ci.yml` triggered on `pull_request` and default-branch pushes, with cancel-in-progress concurrency and the `checks` job (frozen-lockfile install, lint, typecheck, test, build); verify each command passes locally in the same order
- [ ] 7.2 Add the `images` job that builds both images with Buildx and scans each with Trivy (`ignore-unfixed`, failing on HIGH/CRITICAL); verify the local image builds pass and the scan command runs against a locally built image
- [ ] 7.3 Add the `security` job with a high-severity dependency audit and a Gitleaks secret scan; verify a planted fake credential in a scratch file fails the scan locally, then remove the file
- [ ] 7.4 Document the required status checks and confirm the owner enables branch protection (required checks, no direct pushes to the default branch); verify GitHub shows the three checks as required and a red run cannot merge

## 8. System verification and handover

- [ ] 8.1 Run the full local gate from a fresh clone into a temporary directory: `pnpm install`, lint, typecheck, test, build, then the documented Compose command; verify every service is healthy with no manual step beyond copying `.env.example`
- [ ] 8.2 Verify the operational endpoints against the running stack: `/healthz` returns 200 with the database stopped and `/readyz` returns 503 until it is healthy again
- [ ] 8.3 Update `README.md` section 20 (repository status) and add a minimal "Local setup" pointer; verify the documented commands match what was executed in 8.1
- [ ] 8.4 Confirm no real credential, user data, or production value exists in the repository; verify with the secret scan and a manual check of `.env.example`

## Workflow follow-up

- Push the feature branch and open a pull request for owner review; the owner merges and enables branch protection.
- Archive this change after review, following the project's archive workflow.
